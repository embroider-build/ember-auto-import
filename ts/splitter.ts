import makeDebug from 'debug';
import Analyzer, { Import } from './analyzer';
import Package from './package';
import { shallowEqual } from './util';
import { flatten, partition } from 'lodash';
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

export interface ResolvedImport {
  specifier: string;
  entrypoint: string;
  importedBy: Import[];
}

export interface BundleDependencies {
  staticImports: ResolvedImport[];
  dynamicImports: ResolvedImport[];
}

export interface SplitterOptions {
  // list of bundle names in priority order
  bundles: ReadonlyArray<string>;
  analyzers: Map<Analyzer, Package>;
  bundleForPath: (string) => string;
}

export default class Splitter {
  private lastImports = null;
  private lastDeps : Map<string, BundleDependencies> | null = null;

  constructor(private options : SplitterOptions) {}

  async deps() {
    if (this.importsChanged()){
      this.lastDeps = await this.computeDeps(this.options.analyzers);
      debug('output %j', this.lastDeps);
    }
    return this.lastDeps;
  }

  private importsChanged() : boolean {
    let imports = [...this.options.analyzers.keys()].map(analyzer => analyzer.imports);
    if (!this.lastImports || !shallowEqual(this.lastImports, imports)) {
      this.lastImports = imports;
      return true;
    }
  }

  private async computeTargets(analyzers : Map<Analyzer, Package>){
    let specifiers : Map<string, ResolvedImport>  = new Map();
    let imports = flatten([...analyzers.keys()].map(analyzer => analyzer.imports));
    await Promise.all(imports.map(async imp => {

      if (imp.specifier[0] === '.' || imp.specifier[0] === '/') {
        // we're only trying to identify imports of external NPM
        // packages, so relative imports are never relevant.
        return;
      }

      let aliasedSpecifier = imp.package.aliasFor(imp.specifier);
      let parts = aliasedSpecifier.split('/');
      let packageName;
      if (aliasedSpecifier[0] === '@') {
        packageName = `${parts[0]}/${parts[1]}`;
      } else {
        packageName = parts[0];
      }

      if (imp.package.excludesDependency(packageName)){
        // This package has been explicitly excluded.
        return;
      }

      if (!imp.package.hasDependency(packageName) || imp.package.isEmberAddonDependency(packageName)) {
        return;
      }
      imp.package.assertAllowedDependency(packageName);

      let entrypoint = await resolveEntrypoint(aliasedSpecifier, imp.package);
      let seenAlready = specifiers.get(imp.specifier);
      if (seenAlready){
        if (seenAlready.entrypoint !== entrypoint) {
          throw new Error(`${imp.package.name} and ${seenAlready.importedBy[0].package.name} are using different versions of ${imp.specifier} (${entrypoint} vs ${seenAlready.entrypoint})`);
        }
        seenAlready.importedBy.push(imp);
      } else {
        specifiers.set(imp.specifier, {
          specifier: imp.specifier,
          entrypoint,
          importedBy: [imp]
        });
      }
    }));
    return specifiers;
  }

  private async computeDeps(analyzers) {
    let targets = await this.computeTargets(analyzers);
    let deps: Map<string, BundleDependencies > = new Map();

    this.options.bundles.forEach(bundleName => {
      deps.set(bundleName, { staticImports: [], dynamicImports: [] });
    });

    for (let target of targets.values()) {
      let [ dynamicUses, staticUses ] = partition(target.importedBy, imp => imp.isDynamic);
      if (staticUses.length > 0) {
        let bundleName = this.chooseBundle(staticUses);
        deps.get(bundleName).staticImports.push(target);
      }
      if (dynamicUses.length > 0) {
        let bundleName = this.chooseBundle(dynamicUses);
        deps.get(bundleName).dynamicImports.push(target);
      }
    }

    return deps;
  }

  // given that a module is imported by the given list of paths, which
  // bundle should it go in?
  private chooseBundle(importedBy: Import[]) {
    let usedInBundles = {};
    importedBy.forEach(usage => {
      usedInBundles[this.bundleForPath(usage)] = true;
    });
    return this.options.bundles.find(bundle => usedInBundles[bundle]);
  }

  private bundleForPath(usage: Import) {
    let bundleName = this.options.bundleForPath(usage.path);
    if (this.options.bundles.indexOf(bundleName) === -1) {
      throw new Error(`bundleForPath("${usage.path}") returned ${bundleName}" but the only configured bundle names are ${this.options.bundles.join(',')}`);
    }
    debug('bundleForPath("%s")=%s', usage.path, bundleName);
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
