import makeDebug from 'debug';
import Analyzer from './analyzer';
import Package from './package';
import { shallowEqual } from './util';
import { flatMap } from 'lodash';
import {
  NodeJsInputFileSystem,
  CachedInputFileSystem,
  ResolverFactory
} from 'enhanced-resolve';

const debug = makeDebug('ember-auto-import:splitter');
const resolver = ResolverFactory.createResolver({
  fileSystem: new CachedInputFileSystem(new NodeJsInputFileSystem(), 4000),
  extensions: ['.js', '.json'],
  mainFields: ['browser', 'module', 'main']
});

export interface SplitterOptions {
  // list of bundle names in priority order
  bundles: string[];
  analyzers: Map<Analyzer, Package>;
  bundleForPath: (string) => string;
}

export default class Splitter {
  private lastImports = null;
  private lastDeps = null;

  constructor(private options : SplitterOptions) {}

  async depsForBundle(bundleName) {
    if (this.importsChanged()){
      this.lastDeps = await this.computeDeps(this.options.analyzers);
      debug('output %j', this.lastDeps);
    }
    return this.lastDeps[bundleName];
  }

  private importsChanged() : boolean {
    let imports = [...this.options.analyzers.keys()].map(analyzer => analyzer.imports);
    if (!this.lastImports || !shallowEqual(this.lastImports, imports)) {
      this.lastImports = imports;
      return true;
    }
  }

  private flatImports(analyzers: Map<Analyzer, Package>) : { specifier: string, paths: string[], pkg: Package }[] {
    return flatMap([...analyzers.entries()], ([analyzer, pkg]) => {
      return Object.keys(analyzer.imports).map(specifier => {
        return {
          specifier,
          paths: analyzer.imports[specifier],
          pkg
        };
      });
    });
  }

  private async computeTargets(analyzers : Map<Analyzer, Package>){
    let specifiers = Object.create(null);
    let imports = this.flatImports(analyzers);
    await Promise.all(imports.map(async ({ specifier, paths, pkg }) => {

      if (specifier[0] === '.' || specifier[0] === '/') {
        // we're only trying to identify imports of external NPM
        // packages, so relative imports are never relevant.
        return;
      }

      let aliasedSpecifier = pkg.aliasFor(specifier);
      let parts = aliasedSpecifier.split('/');
      let packageName;
      if (aliasedSpecifier[0] === '@') {
        packageName = `${parts[0]}/${parts[1]}`;
      } else {
        packageName = parts[0];
      }

      if (pkg.excludesDependency(packageName)){
        // This package has been explicitly excluded.
        return;
      }

      if (!pkg.hasDependency(packageName) || pkg.isEmberAddonDependency(packageName)) {
        return;
      }
      pkg.assertAllowedDependency(packageName);

      let entrypoint = await resolveEntrypoint(aliasedSpecifier, pkg);
      let shouldTranspile = pkg.shouldTranspile(packageName);
      let seenAlready = specifiers[specifier];
      if (seenAlready){
        if (seenAlready.entrypoint !== entrypoint) {
          throw new Error(`${pkg.name} and ${seenAlready.pkg.name} are using different versions of ${specifier} (${entrypoint} vs ${seenAlready.entrypoint})`);
        }
        seenAlready.paths = seenAlready.paths.concat(paths);
        seenAlready.shouldTranspile = seenAlready.shouldTranspile || shouldTranspile;
      } else {
        specifiers[specifier] = {
          entrypoint,
          paths,
          pkg,
          shouldTranspile
        };
      }
    }));
    return specifiers;
  }

  private async computeDeps(analyzers) {
    let targets = await this.computeTargets(analyzers);
    let deps = {};

    this.options.bundles.forEach(bundleName => {
      deps[bundleName] = {};
    });

    await Promise.all(Object.keys(targets).map(async specifier => {
      let bundleName = this.chooseBundle(targets[specifier].paths);
      deps[bundleName][specifier] = {
        entrypoint: targets[specifier].entrypoint
      };
    }));

    return deps;
  }

  // given that a module is imported by the given list of paths, which
  // bundle should it go in?
  private chooseBundle(paths) {
    let usedInBundles = {};
    paths.forEach(path => {
      usedInBundles[this.bundleForPath(path)] = true;
    });
    return this.options.bundles.find(bundle => usedInBundles[bundle]);
  }

  private bundleForPath(path) {
    let bundleName = this.options.bundleForPath(path);
    if (this.options.bundles.indexOf(bundleName) === -1) {
      throw new Error(`bundleForPath("${path}") returned ${bundleName}" but the only configured bundle names are ${this.options.bundles.join(',')}`);
    }
    debug('bundleForPath("%s")=%s', path, bundleName);
    return bundleName;
  }
}

async function resolveEntrypoint(specifier, pkg) : Promise<string> {
  return new Promise((resolvePromise, reject) => {
    resolver.resolve({}, pkg.root, specifier, {}, (err, path) => {
      if (err) {
        reject(err);
      } else {
        resolvePromise(path);
      }
    });
  }) as Promise<string>;
}
