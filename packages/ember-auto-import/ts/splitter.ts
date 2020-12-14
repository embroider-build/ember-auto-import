import makeDebug from 'debug';
import Analyzer, { Import, LiteralImport, TemplateImport } from './analyzer';
import Package from './package';
import { shallowEqual } from './util';
import { flatten, partition, values } from 'lodash';
import {
  NodeJsInputFileSystem,
  CachedInputFileSystem,
  ResolverFactory
} from 'enhanced-resolve';
import { findUpPackagePath } from 'resolve-package-path';
import { dirname, join } from 'path';
import BundleConfig from './bundle-config';
import { AbstractInputFileSystem } from 'enhanced-resolve/lib/common-types';

const debug = makeDebug('ember-auto-import:splitter');

// these are here because we do our own resolving of entrypoints, so we
// configure enhanced-resolve directly. But in the case of template literal
// imports, we only resolve down to the right directory and leave the file
// discovery up to webpack, so webpack needs to also know the options we're
// using.
export const sharedResolverOptions = {
  extensions: ['.js', '.ts', '.json'],
  mainFields: ['browser', 'module', 'main'],
};

const resolver = ResolverFactory.createResolver({
  // upstream types seem to be broken here
  fileSystem: new CachedInputFileSystem(new NodeJsInputFileSystem(), 4000) as unknown as AbstractInputFileSystem,
  ...sharedResolverOptions,
});

export interface ResolvedImport {
  // for literal imports, the actual specifier. For template imports, a string
  // representation of the template literal like "your-thing/${e}".
  specifierKey: string;

  // for literal imports, the complete path to the entrypoint file. For template
  // imports, the complete path up to the first quasi.
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
        if ('specifier' in imp) {
          await this.handleLiteralImport(imp, specifiers);
        } else {
          await this.handleTemplateImport(imp, specifiers);
        }
      })
    );
    return specifiers;
  }

  private async handleLiteralImport(imp: LiteralImport, specifiers: Map<string, ResolvedImport>) {
    let target = imp.package.resolve(imp.specifier);
    if (!target) {
      return;
    }

    if (target.type === 'local') {
      // we're only trying to identify imports of external NPM
      // packages, so relative imports are never relevant.
      if (imp.isDynamic) {
        throw new Error(`ember-auto-import does not support dynamic relative imports. "${imp.specifier}" is relative. To make this work, you need to upgrade to Embroider.`);
      }
      return;
    }

    let entrypoint = await resolveEntrypoint(target.path, imp.package);
    let seenAlready = specifiers.get(imp.specifier);
    if (seenAlready) {
      await this.assertSafeVersion(seenAlready, imp, entrypoint);
      seenAlready.importedBy.push(imp);
    } else {
      specifiers.set(imp.specifier, {
        specifierKey: imp.specifier,
        entrypoint,
        importedBy: [imp]
      });
    }
  }

  private async handleTemplateImport(imp: TemplateImport, specifiers: Map<string, ResolvedImport>) {
    let leadingQuasi = imp.cookedQuasis[0];

    if (!isPrecise(leadingQuasi)) {
      throw new Error(`Dynamic imports must target unambiguous package names. ${leadingQuasi} is ambiguous`);
    }

    let target = imp.package.resolve(leadingQuasi);
    if (!target) {
      return;
    }

    if (target.type === 'local') {
      throw new Error(`ember-auto-import does not support dynamic relative imports. "${leadingQuasi}" is relative. To make this work, you need to upgrade to Embroider.`);
    }

    // this just makes the key look pleasantly like the original template
    // string, there's nothing magical about "e" here, it just means "an
    // expression goes here and we don't care which one".c
    let specifierKey = imp.cookedQuasis.join('${e}');

    let entrypoint = join(target.packagePath.slice(0, -1*"package.json".length), target.local);
    let seenAlready = specifiers.get(specifierKey);
    if (seenAlready) {
      await this.assertSafeVersion(seenAlready, imp, entrypoint);
      seenAlready.importedBy.push(imp);
    } else {
      specifiers.set(specifierKey, {
        specifierKey,
        entrypoint,
        importedBy: [imp]
      });
    }
  }

  private async versionOfPackage(entrypoint: string) {
    if (this.packageVersions.has(entrypoint)) {
      return this.packageVersions.get(entrypoint);
    }
    let pkgPath = findUpPackagePath(dirname(entrypoint));
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
          have.specifierKey
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
      imports.sort((a, b) => a.specifierKey.localeCompare(b.specifierKey));
    }
  }

  // given that a module is imported by the given list of paths, which
  // bundle should it go in?
  private chooseBundle(importedBy: Import[]) {
    let usedInBundles = {} as { [bundleName: string]: boolean };
    importedBy.forEach(usage => {
      usedInBundles[this.bundleFor(usage)] = true;
    });
    return this.options.bundles.names.find(bundle => usedInBundles[bundle])!;
  }

  private bundleFor(usage: Import) {
    let bundleName = usage.treeType === undefined || typeof this.options.bundles.bundleForTreeType !== 'function'
      ? this.options.bundles.bundleForPath(usage.path)
      : this.options.bundles.bundleForTreeType(usage.treeType);

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
      specifierKey: imp.specifierKey,
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

function count(str: string, letter: string): number {
  return [...str].reduce((a,b) => a + (b === letter ? 1 : 0), 0);
}

function isPrecise(leadingQuasi: string): boolean {
  if (leadingQuasi.startsWith('.') || leadingQuasi.startsWith('/')) {
    return true;
  }
  let slashes = count(leadingQuasi, '/');
  let minSlashes = leadingQuasi.startsWith('@') ? 2 : 1;
  return slashes >= minSlashes;
}
