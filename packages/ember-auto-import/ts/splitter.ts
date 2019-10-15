import makeDebug from 'debug';
import Analyzer, { Import } from './analyzer';
import Package from './package';
import { shallowEqual } from './util';
import { flatten, partition, values } from 'lodash';
import {
  NodeJsInputFileSystem,
  CachedInputFileSystem,
  ResolverFactory
} from 'enhanced-resolve';
import pkgUp from 'pkg-up';
import { dirname } from 'path';
import BundleConfig from './bundle-config';
import { AbstractInputFileSystem } from 'enhanced-resolve/lib/common-types';

const debug = makeDebug('ember-auto-import:splitter');
const resolver = ResolverFactory.createResolver({
  // upstream types seem to be broken here
  fileSystem: new CachedInputFileSystem(new NodeJsInputFileSystem(), 4000) as unknown as AbstractInputFileSystem,
  extensions: ['.js', '.ts', '.json'],
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
  bundles: BundleConfig;
  analyzers: Map<Analyzer, Package>;
}

export default class Splitter {
  private lastImports: Import[][] | undefined;
  private lastDeps: Map<string, BundleDependencies> | null = null;
  private packageVersions: Map<string, string> = new Map();

  constructor(private options: SplitterOptions) {}

  async deps(): Promise<Map<string, BundleDependencies>> {
    if (this.importsChanged()) {
      this.lastDeps = await this.computeDeps(this.options.analyzers);
      debug('output %s', new LazyPrintDeps(this.lastDeps));
    }
    return this.lastDeps!;
  }

  private importsChanged(): boolean {
    let imports = [...this.options.analyzers.keys()].map(
      analyzer => analyzer.imports
    );
    if (!this.lastImports || !shallowEqual(this.lastImports, imports)) {
      this.lastImports = imports;
      return true;
    }
    return false;
  }

  private async computeTargets(analyzers: Map<Analyzer, Package>) {
    let specifiers: Map<string, ResolvedImport> = new Map();
    let imports = flatten(
      [...analyzers.keys()].map(analyzer => analyzer.imports)
    );
    await Promise.all(
      imports.map(async imp => {
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

        if (imp.package.excludesDependency(packageName)) {
          // This package has been explicitly excluded.
          return;
        }

        if (
          !imp.package.hasDependency(packageName) ||
          imp.package.isEmberAddonDependency(packageName)
        ) {
          return;
        }
        imp.package.assertAllowedDependency(packageName);

        let entrypoint = await resolveEntrypoint(aliasedSpecifier, imp.package);
        let seenAlready = specifiers.get(imp.specifier);
        if (seenAlready) {
          await this.assertSafeVersion(seenAlready, imp, entrypoint);
          seenAlready.importedBy.push(imp);
        } else {
          specifiers.set(imp.specifier, {
            specifier: imp.specifier,
            entrypoint,
            importedBy: [imp]
          });
        }
      })
    );
    return specifiers;
  }

  private async versionOfPackage(entrypoint: string) {
    if (this.packageVersions.has(entrypoint)) {
      return this.packageVersions.get(entrypoint);
    }
    let pkgPath = await pkgUp(dirname(entrypoint));
    let version = null;
    if (pkgPath) {
      let pkg = require(pkgPath);
      version = pkg.version;
    }
    this.packageVersions.set(entrypoint, version);
    return version;
  }

  private async assertSafeVersion(
    have: ResolvedImport,
    nextImport: Import,
    entrypoint: string
  ) {
    if (have.entrypoint === entrypoint) {
      // both import statements are resolving to the exact same entrypoint --
      // this is the normal and happy case
      return;
    }

    let [haveVersion, nextVersion] = await Promise.all([
      this.versionOfPackage(have.entrypoint),
      this.versionOfPackage(entrypoint)
    ]);
    if (haveVersion !== nextVersion) {
      throw new Error(
        `${nextImport.package.name} and ${
          have.importedBy[0].package.name
        } are using different versions of ${
          have.specifier
        } (${nextVersion} located at ${entrypoint} vs ${haveVersion} located at ${
          have.entrypoint
        })`
      );
    }
  }

  private async computeDeps(analyzers: SplitterOptions["analyzers"]): Promise<Map<string, BundleDependencies>> {
    let targets = await this.computeTargets(analyzers);
    let deps: Map<string, BundleDependencies> = new Map();

    this.options.bundles.names.forEach(bundleName => {
      deps.set(bundleName, { staticImports: [], dynamicImports: [] });
    });

    for (let target of targets.values()) {
      let [dynamicUses, staticUses] = partition(
        target.importedBy,
        imp => imp.isDynamic
      );
      if (staticUses.length > 0) {
        let bundleName = this.chooseBundle(staticUses);
        deps.get(bundleName)!.staticImports.push(target);
      }
      if (dynamicUses.length > 0) {
        let bundleName = this.chooseBundle(dynamicUses);
        deps.get(bundleName)!.dynamicImports.push(target);
      }
    }

    this.sortDependencies(deps);

    return deps;
  }

  private sortDependencies(deps: Map<string, BundleDependencies>) {
    for (const bundle of deps.values()) {
      this.sortBundle(bundle);
    }
  }

  private sortBundle(bundle: BundleDependencies) {
    for (const imports of values(bundle)) {
      imports.sort((a, b) => a.specifier.localeCompare(b.specifier));
    }
  }

  // given that a module is imported by the given list of paths, which
  // bundle should it go in?
  private chooseBundle(importedBy: Import[]) {
    let usedInBundles = {} as { [bundleName: string]: boolean };
    importedBy.forEach(usage => {
      usedInBundles[this.bundleForPath(usage)] = true;
    });
    return this.options.bundles.names.find(bundle => usedInBundles[bundle])!;
  }

  private bundleForPath(usage: Import) {
    let bundleName = this.options.bundles.bundleForPath(usage.path);
    if (this.options.bundles.names.indexOf(bundleName) === -1) {
      throw new Error(
        `bundleForPath("${
          usage.path
        }") returned ${bundleName}" but the only configured bundle names are ${this.options.bundles.names.join(
          ','
        )}`
      );
    }
    debug('bundleForPath("%s")=%s', usage.path, bundleName);
    return bundleName;
  }
}

async function resolveEntrypoint(specifier: string, pkg: Package): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    // upstream types seem to be out of date here
    (resolver.resolve as any)({}, pkg.root, specifier, {}, (err: Error, path: string) => {
      if (err) {
        reject(err);
      } else {
        resolvePromise(path);
      }
    });
  }) as Promise<string>;
}

class LazyPrintDeps {
  constructor(private deps: Map<string, BundleDependencies>) {}

  private describeResolvedImport(imp: ResolvedImport) {
    return {
      specifier: imp.specifier,
      entrypoint: imp.entrypoint,
      importedBy: imp.importedBy.map(this.describeImport.bind(this))
    };
  }

  private describeImport(imp: Import) {
    return {
      package: imp.package.name,
      path: imp.path,
      isDynamic: imp.isDynamic
    };
  }

  toString() {
    let output = {} as { [bundle: string]: any };
    for (let [
      bundle,
      { staticImports, dynamicImports }
    ] of this.deps.entries()) {
      output[bundle] = {
        static: staticImports.map(this.describeResolvedImport.bind(this)),
        dynamic: dynamicImports.map(this.describeResolvedImport.bind(this))
      };
    }
    return JSON.stringify(output, null, 2);
  }
}
