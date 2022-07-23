import makeDebug from 'debug';
import Analyzer, { Import, LiteralImport, TemplateImport } from './analyzer';
import Package, { DepResolution } from './package';
import { shallowEqual } from './util';
import { flatten, partition } from 'lodash';
import BundleConfig from './bundle-config';
import { join } from 'path';
import { satisfies } from 'semver';

const debug = makeDebug('ember-auto-import:splitter');

export interface ResolvedImport {
  specifier: string;
  packageName: string;
  packageRoot: string;
  importedBy: LiteralImport[];
}

export interface ResolvedTemplateImport {
  cookedQuasis: string[];
  expressionNameHints: string[];
  packageName: string;
  packageRoot: string;
  importedBy: TemplateImport[];
}

export interface BundleDependencies {
  staticImports: ResolvedImport[];
  staticTemplateImports: ResolvedTemplateImport[];
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
    let imports = [...this.options.analyzers.keys()].map(
      (analyzer) => analyzer.imports
    );
    if (!this.lastImports || !shallowEqual(this.lastImports, imports)) {
      this.lastImports = imports;
      return true;
    }
    return false;
  }

  private async computeTargets(analyzers: Map<Analyzer, Package>) {
    let targets: Map<string, ResolvedImport> = new Map();
    let templateTargets: Map<string, ResolvedTemplateImport> = new Map();
    let imports = flatten(
      [...analyzers.keys()].map((analyzer) => analyzer.imports)
    );
    await Promise.all(
      imports.map(async (imp) => {
        if ('specifier' in imp) {
          await this.handleLiteralImport(imp, targets);
        } else {
          await this.handleTemplateImport(imp, templateTargets);
        }
      })
    );
    return { targets, templateTargets };
  }

  private async handleLiteralImport(
    imp: LiteralImport,
    targets: Map<string, ResolvedImport>
  ) {
    let target = imp.package.resolve(imp.specifier, imp.path);

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

    let seenAlready = targets.get(imp.specifier);
    if (seenAlready) {
      await this.assertSafeVersion(seenAlready, imp, target);
      seenAlready.importedBy.push(imp);
    } else {
      targets.set(imp.specifier, {
        specifier: imp.specifier,
        packageName: target.packageName,
        packageRoot: target.packageRoot,
        importedBy: [imp],
      });
    }
  }

  private async handleTemplateImport(
    imp: TemplateImport,
    targets: Map<string, ResolvedTemplateImport>
  ) {
    let [leadingQuasi] = imp.cookedQuasis;

    let target = imp.package.resolve(leadingQuasi, imp.path, true);

    if (!target) {
      throw new Error(
        `ember-auto-import is unable to handle '${leadingQuasi}'. ` +
          `The attempted import of '${imp.cookedQuasis.join(
            ''
          )}' is located in ${imp.path}`
      );
    }

    if (target.type === 'local') {
      return;
    }

    if (target.type === 'imprecise') {
      throw new Error(
        `Dynamic imports must target unambiguous package names. '${leadingQuasi}' is ambiguous. ` +
          `The attempted import of '${imp.cookedQuasis.join(
            ''
          )}' is located in ${imp.path}`
      );
    }

    if (target.type === 'url') {
      return;
    }

    // this just makes the key look pleasantly like the original template
    // string, there's nothing magical about "e" here, it just means "an
    // expression goes here and we don't care which one".c
    let specifierKey = imp.cookedQuasis.join('${e}');

    let seenAlready = targets.get(specifierKey);
    if (seenAlready) {
      await this.assertSafeVersion(seenAlready, imp, target);
      seenAlready.importedBy.push(imp);
    } else {
      targets.set(specifierKey, {
        packageName: target.packageName,
        packageRoot: target.packageRoot,
        cookedQuasis: imp.cookedQuasis,
        expressionNameHints: imp.expressionNameHints.map(
          (hint, index) => hint || `arg${index}`
        ),
        importedBy: [imp],
      });
    }
  }

  private async versionOfPackage(packageRoot: string) {
    if (this.packageVersions.has(packageRoot)) {
      return this.packageVersions.get(packageRoot);
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    let pkg = require(join(packageRoot, 'package.json'));
    let version = pkg.version;
    this.packageVersions.set(packageRoot, version);
    return version;
  }

  private async assertSafeVersion(
    alreadyResolved: ResolvedImport | ResolvedTemplateImport,
    nextImport: Import,
    nextTarget: DepResolution
  ) {
    if (alreadyResolved.packageRoot === nextTarget.packageRoot) {
      // the next import is resolving to the same copy of the package we are
      // already using. This is the normal and happy case.
      return;
    }

    let requestedRange = nextImport.package.requestedRange(
      nextTarget.packageName
    );
    if (!requestedRange) {
      // this is probably an error condition, but it's not the error condition
      // that this particular assertion is checking. Our job is just to make
      // sure nobody's requested semver ranges are violated. If you don't have
      // any range, we can't violate it. In practice if you lacked a declared
      // dependency, Package#resolve would have failed earlier than this because
      // it ensures we only resolve declared dependencies.
      return;
    }

    let haveVersion = await this.versionOfPackage(alreadyResolved.packageRoot);

    if (!satisfies(haveVersion, requestedRange, { includePrerelease: true })) {
      throw new Error(
        `${nextImport.package.name} needs ${
          nextTarget.packageName
        } satisfying ${requestedRange}, but we have version ${haveVersion} because of ${alreadyResolved.importedBy
          .map((i) => i.package.name)
          .join(', ')}`
      );
    }
  }

  private async computeDeps(
    analyzers: SplitterOptions['analyzers']
  ): Promise<Map<string, BundleDependencies>> {
    let targets = await this.computeTargets(analyzers);
    let deps: Map<string, BundleDependencies> = new Map();

    this.options.bundles.names.forEach((bundleName) => {
      deps.set(bundleName, {
        staticImports: [],
        staticTemplateImports: [],
        dynamicImports: [],
        dynamicTemplateImports: [],
      });
    });

    for (let target of targets.targets.values()) {
      let [dynamicUses, staticUses] = partition(
        target.importedBy,
        (imp) => imp.isDynamic
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

    for (let target of targets.templateTargets.values()) {
      let [dynamicUses, staticUses] = partition(
        target.importedBy,
        (imp) => imp.isDynamic
      );
      if (staticUses.length > 0) {
        let bundleName = this.chooseBundle(staticUses);
        deps.get(bundleName)!.staticTemplateImports.push(target);
      }
      if (dynamicUses.length > 0) {
        let bundleName = this.chooseBundle(dynamicUses);
        deps.get(bundleName)!.dynamicTemplateImports.push(target);
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
    bundle.staticImports.sort((a, b) => a.specifier.localeCompare(b.specifier));
    bundle.dynamicImports.sort((a, b) =>
      a.specifier.localeCompare(b.specifier)
    );
    bundle.dynamicTemplateImports.sort((a, b) =>
      a.cookedQuasis[0].localeCompare(b.cookedQuasis[0])
    );
  }

  // given that a module is imported by the given list of paths, which
  // bundle should it go in?
  private chooseBundle(importedBy: Import[]) {
    let usedInBundles = {} as { [bundleName: string]: boolean };
    importedBy.forEach((usage) => {
      usedInBundles[this.bundleFor(usage)] = true;
    });
    return this.options.bundles.names.find((bundle) => usedInBundles[bundle])!;
  }

  private bundleFor(usage: Import) {
    let bundleName =
      usage.treeType === undefined ||
      typeof this.options.bundles.bundleForTreeType !== 'function'
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

class LazyPrintDeps {
  constructor(private deps: Map<string, BundleDependencies>) {}

  private describeResolvedImport(imp: ResolvedImport) {
    return {
      specifier: imp.specifier,
      packageRoot: imp.packageRoot,
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
    for (let [
      bundle,
      { staticImports, dynamicImports, dynamicTemplateImports },
    ] of this.deps.entries()) {
      output[bundle] = {
        static: staticImports.map(this.describeResolvedImport.bind(this)),
        dynamic: dynamicImports.map(this.describeResolvedImport.bind(this)),
        dynamicTemplate: dynamicTemplateImports.map(
          this.describeTemplateImport.bind(this)
        ),
      };
    }
    return JSON.stringify(output, null, 2);
  }
}
