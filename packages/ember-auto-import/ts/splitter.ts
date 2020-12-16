import makeDebug from 'debug';
import Analyzer, { Import, LiteralImport, TemplateImport } from './analyzer';
import Package from './package';
import { shallowEqual } from './util';
import { flatten, partition } from 'lodash';
import { NodeJsInputFileSystem, CachedInputFileSystem, ResolverFactory } from 'enhanced-resolve';
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
  fileSystem: (new CachedInputFileSystem(new NodeJsInputFileSystem(), 4000) as unknown) as AbstractInputFileSystem,
  ...sharedResolverOptions,
});

export interface ResolvedImport {
  specifier: string;
  entrypoint: string;
  importedBy: LiteralImport[];
}

export interface ResolvedTemplateImport {
  cookedQuasis: string[];
  expressionNameHints: string[];
  importedBy: TemplateImport[];
}

export interface BundleDependencies {
  staticImports: ResolvedImport[];
  dynamicImports: ResolvedImport[];
  dynamicTemplateImports: ResolvedTemplateImport[];
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
    let imports = [...this.options.analyzers.keys()].map(analyzer => analyzer.imports);
    if (!this.lastImports || !shallowEqual(this.lastImports, imports)) {
      this.lastImports = imports;
      return true;
    }
    return false;
  }

  private async computeTargets(analyzers: Map<Analyzer, Package>) {
    let targets: Map<string, ResolvedImport> = new Map();
    let templateTargets: Map<string, ResolvedTemplateImport> = new Map();
    let imports = flatten([...analyzers.keys()].map(analyzer => analyzer.imports));
    await Promise.all(
      imports.map(async imp => {
        if ('specifier' in imp) {
          await this.handleLiteralImport(imp, targets);
        } else {
          await this.handleTemplateImport(imp, templateTargets);
        }
      })
    );
    return { targets, templateTargets };
  }

  private async handleLiteralImport(imp: LiteralImport, targets: Map<string, ResolvedImport>) {
    let target = imp.package.resolve(imp.specifier);
    if (!target) {
      return;
    }

    if (target.type === 'url') {
      // people can statically import from URLs if they want to, that's clearly
      // nothing to do with us (though in practice the rest of ember-cli will
      // generally be sad about this)
      return;
    }

    if (target.type === 'local') {
      // we're only trying to identify imports of external NPM
      // packages, so relative imports are never relevant.
      if (imp.isDynamic) {
        throw new Error(
          `ember-auto-import does not support dynamic relative imports. "${imp.specifier}" is relative. To make this work, you need to upgrade to Embroider.`
        );
      }
      return;
    }

    let entrypoint = await resolveEntrypoint(target.path, imp.package);
    let seenAlready = targets.get(imp.specifier);
    if (seenAlready) {
      await this.assertSafeVersion(seenAlready.entrypoint, seenAlready.importedBy[0], imp, entrypoint);
      seenAlready.importedBy.push(imp);
    } else {
      targets.set(imp.specifier, {
        specifier: imp.specifier,
        entrypoint,
        importedBy: [imp],
      });
    }
  }

  private async handleTemplateImport(imp: TemplateImport, targets: Map<string, ResolvedTemplateImport>) {
    let [leadingQuasi, ...rest] = imp.cookedQuasis;

    let target = imp.package.resolve(leadingQuasi, true);
    if (!target) {
      throw new Error(`ember-auto-import is unable to handle ${leadingQuasi}`);
    }

    if (target.type === 'local') {
      throw new Error(
        `ember-auto-import does not support dynamic relative imports. "${leadingQuasi}" is relative. To make this work, you need to upgrade to Embroider.`
      );
    }

    if (target.type === 'imprecise') {
      throw new Error(`Dynamic imports must target unambiguous package names. ${leadingQuasi} is ambiguous`);
    }

    if (target.type === 'url') {
      return;
    }

    // this just makes the key look pleasantly like the original template
    // string, there's nothing magical about "e" here, it just means "an
    // expression goes here and we don't care which one".c
    let specifierKey = imp.cookedQuasis.join('${e}');

    let entrypoint = join(target.packagePath.slice(0, -1 * 'package.json'.length), target.local);
    let seenAlready = targets.get(specifierKey);
    if (seenAlready) {
      await this.assertSafeVersion(seenAlready.cookedQuasis[0], seenAlready.importedBy[0], imp, entrypoint);
      seenAlready.importedBy.push(imp);
    } else {
      targets.set(specifierKey, {
        cookedQuasis: [entrypoint, ...rest],
        expressionNameHints: imp.expressionNameHints.map((hint, index) => hint || `arg${index}`),
        importedBy: [imp],
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
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      let pkg = require(pkgPath);
      version = pkg.version;
    }
    this.packageVersions.set(entrypoint, version);
    return version;
  }

  private async assertSafeVersion(haveEntrypoint: string, prevImport: Import, nextImport: Import, entrypoint: string) {
    if (haveEntrypoint === entrypoint) {
      // both import statements are resolving to the exact same entrypoint --
      // this is the normal and happy case
      return;
    }

    let [haveVersion, nextVersion] = await Promise.all([
      this.versionOfPackage(haveEntrypoint),
      this.versionOfPackage(entrypoint),
    ]);
    if (haveVersion !== nextVersion) {
      throw new Error(
        `${nextImport.package.name} and ${prevImport.package.name} are using different versions of ${
          'specifier' in prevImport ? prevImport.specifier : prevImport.cookedQuasis[0]
        } (${nextVersion} located at ${entrypoint} vs ${haveVersion} located at ${haveEntrypoint})`
      );
    }
  }

  private async computeDeps(analyzers: SplitterOptions['analyzers']): Promise<Map<string, BundleDependencies>> {
    let targets = await this.computeTargets(analyzers);
    let deps: Map<string, BundleDependencies> = new Map();

    this.options.bundles.names.forEach(bundleName => {
      deps.set(bundleName, {
        staticImports: [],
        dynamicImports: [],
        dynamicTemplateImports: [],
      });
    });

    for (let target of targets.targets.values()) {
      let [dynamicUses, staticUses] = partition(target.importedBy, imp => imp.isDynamic);
      if (staticUses.length > 0) {
        let bundleName = this.chooseBundle(staticUses);
        deps.get(bundleName)!.staticImports.push(target);
      }
      if (dynamicUses.length > 0) {
        let bundleName = this.chooseBundle(dynamicUses);
        deps.get(bundleName)!.dynamicImports.push(target);
      }
    }

    for (let target of targets.templateTargets.values()) {
      let bundleName = this.chooseBundle(target.importedBy);
      deps.get(bundleName)!.dynamicTemplateImports.push(target);
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
    bundle.staticImports.sort((a, b) => a.specifier.localeCompare(b.specifier));
    bundle.dynamicImports.sort((a, b) => a.specifier.localeCompare(b.specifier));
    bundle.dynamicTemplateImports.sort((a, b) => a.cookedQuasis[0].localeCompare(b.cookedQuasis[0]));
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
    let bundleName =
      usage.treeType === undefined || typeof this.options.bundles.bundleForTreeType !== 'function'
        ? this.options.bundles.bundleForPath(usage.path)
        : this.options.bundles.bundleForTreeType(usage.treeType);

    if (this.options.bundles.names.indexOf(bundleName) === -1) {
      throw new Error(
        `bundleForPath("${
          usage.path
        }") returned ${bundleName}" but the only configured bundle names are ${this.options.bundles.names.join(',')}`
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
      importedBy: imp.importedBy.map(this.describeImport.bind(this)),
    };
  }

  private describeImport(imp: Import) {
    return {
      package: imp.package.name,
      path: imp.path,
    };
  }

  private describeTemplateImport(imp: ResolvedTemplateImport) {
    return {
      cookedQuasis: imp.cookedQuasis,
      expressionNameHints: imp.expressionNameHints,
      importedBy: imp.importedBy.map(this.describeImport.bind(this)),
    };
  }

  toString() {
    let output = {} as { [bundle: string]: any };
    for (let [bundle, { staticImports, dynamicImports, dynamicTemplateImports }] of this.deps.entries()) {
      output[bundle] = {
        static: staticImports.map(this.describeResolvedImport.bind(this)),
        dynamic: dynamicImports.map(this.describeResolvedImport.bind(this)),
        dynamicTemplate: dynamicTemplateImports.map(this.describeTemplateImport.bind(this)),
      };
    }
    return JSON.stringify(output, null, 2);
  }
}
