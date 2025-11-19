import Splitter from './splitter';
import { Bundler, debugBundler } from './bundler';
import Analyzer from './analyzer';
import type { TreeType } from './analyzer';
import Package, { V2AddonResolver } from './package';
import BroccoliDebug from 'broccoli-debug';
import BundleConfig from './bundle-config';
import type { Node } from 'broccoli-node-api';
import { LeaderChooser } from './leader';
import {
  type AddonInstance,
  type AddonMeta,
  type AppInstance,
  findTopmostAddon,
  isDeepAddonInstance,
  PackageCache,
} from '@embroider/shared-internals';
import WebpackBundler from './webpack';
import { Memoize } from 'typescript-memoize';
import { WatchedDir } from 'broccoli-source';
import { Inserter } from './inserter';
import mergeTrees from 'broccoli-merge-trees';
import resolve from 'resolve';
import type webpackType from 'webpack';
import resolvePackagePath from 'resolve-package-path';
import semver from 'semver';
import type { TransformOptions } from '@babel/core';
import { MARKER } from './analyzer-syntax';
import path from 'path';
import funnel from 'broccoli-funnel';
import makeDebug from 'debug';
import { externalName } from '@embroider/reverse-exports';

const debugTree = BroccoliDebug.buildDebugCallback('ember-auto-import');
const debugWatch = makeDebug('ember-auto-import:watch');

// This interface must be stable across all versions of ember-auto-import that
// speak the same leader-election protocol. So don't change this unless you know
// what you're doing.
export interface AutoImportSharedAPI {
  isPrimary(addonInstance: AddonInstance): boolean;
  analyze(
    tree: Node,
    addon: AddonInstance,
    treeType?: TreeType,
    supportsFastAnalyzer?: true
  ): Node;
  included(addonInstance: AddonInstance): void;
  addTo(tree: Node): Node;
  registerV2Addon(
    packageName: string,
    packageRoot: string,
    compatOptions?: CompatOptions
  ): void;
}

// This interface must be stable across all versions of ember-auto-import that
// speak the same leader-election protocol. So don't change this unless you know
// what you're doing.
export interface CompatOptions {
  customizeMeta?: (meta: AddonMeta) => AddonMeta;
}

export default class AutoImport implements AutoImportSharedAPI {
  private packages: Set<Package> = new Set();
  private packageCache: PackageCache;
  private env: 'development' | 'test' | 'production';
  private consoleWrite: (msg: string) => void;
  private analyzers: Map<Analyzer, Package> = new Map();
  private bundles: BundleConfig;

  // maps packageName to packageRoot
  private v2Addons = new Map<
    string,
    { root: string; options: CompatOptions }
  >();

  static register(addon: AddonInstance) {
    LeaderChooser.for(addon).register(addon, () => new AutoImport(addon));
  }

  static lookup(addon: AddonInstance): AutoImportSharedAPI {
    return LeaderChooser.for(addon).leader;
  }

  constructor(addonInstance: AddonInstance) {
    let topmostAddon = findTopmostAddon(addonInstance);
    this.packageCache = PackageCache.shared(
      'ember-auto-import',
      topmostAddon.project.root
    );
    this.packages.add(
      Package.lookupParentOf(topmostAddon, this.v2AddonResolver)
    );
    let host = topmostAddon.app;

    this.installAppFilter(host);

    this.env = host.env;
    this.bundles = new BundleConfig(host.options.outputPaths);
    if (!this.env) {
      throw new Error('Bug in ember-auto-import: did not discover environment');
    }

    this.consoleWrite = (...args) => addonInstance.project.ui.write(...args);
  }

  installAppFilter(_host: AppInstance) {
    // TODO upstream this type change to @embroider/shared-internals
    let host: AppInstance & {
      trees: {
        app: Node;
      };
    } = _host as any;
    if (this.rootPackage.allowAppImports.length) {
      host.trees.app = funnel(host.trees.app, {
        exclude: this.rootPackage.allowAppImports,
      });
    }
  }

  // we don't actually call this ourselves anymore, but earlier versions of
  // ember-auto-import will still call it on us. For them the answer is always
  // false.
  isPrimary(_addon: AddonInstance) {
    return false;
  }

  analyze(
    tree: Node,
    addon: AddonInstance,
    treeType?: TreeType,
    supportsFastAnalyzer?: true
  ) {
    let pack = Package.lookupParentOf(addon, this.v2AddonResolver);
    this.packages.add(pack);
    let analyzer = new Analyzer(
      debugTree(tree, `preprocessor:input-${this.analyzers.size}`),
      pack,
      treeType,
      supportsFastAnalyzer
    );
    this.analyzers.set(analyzer, pack);
    return analyzer;
  }

  registerV2Addon(
    packageName: string,
    packageRoot: string,
    options: CompatOptions = {}
  ): void {
    this.v2Addons.set(packageName, { root: packageRoot, options });
  }

  get v2AddonResolver(): V2AddonResolver {
    return {
      hasV2Addon: (name: string): boolean => {
        return this.v2Addons.has(name);
      },

      v2AddonRoot: (name: string): string | undefined => {
        return this.v2Addons.get(name)?.root;
      },

      handleRenaming: (name: string): string => {
        let hit = this.renamedModules().get(name);
        if (hit) {
          return hit;
        }
        hit = this.renamedModules().get(name + '.js');
        if (hit) {
          return hit;
        }
        hit = this.renamedModules().get(name + '/index.js');
        if (hit) {
          return hit;
        }
        return name;
      },

      implicitImports: (packageRoot: string): string[] => {
        let output: string[] = [];
        for (let dep of this.packageCache.get(packageRoot).dependencies) {
          if (dep.isV2Addon()) {
            let meta = dep.meta;
            let customize = this.v2Addons.get(dep.name)?.options?.customizeMeta;
            if (customize) {
              // json here is just a super simple clone so the hook can't mutate
              // our cache unintentionally
              meta = customize(JSON.parse(JSON.stringify(meta)));
            }
            let implicitModules = meta['implicit-modules'];
            if (implicitModules) {
              for (let localPath of implicitModules) {
                let specifier = externalName(dep.packageJSON, localPath);
                if (!specifier) {
                  throw new Error(
                    `${dep.name} declared implicit-module ${localPath} but that is not accessible outside the package`
                  );
                }
                if (meta['renamed-modules']) {
                  for (let [renamed, original] of Object.entries(
                    meta['renamed-modules']
                  )) {
                    if (specifier === original) {
                      specifier = renamed;
                    }
                  }
                }
                if (specifier.endsWith('.js')) {
                  specifier = specifier.slice(0, -3);
                }
                output.push(specifier);
              }
            }
          }
        }
        return output;
      },
    };
  }

  private _renamedModules: Map<string, string> | undefined;

  private renamedModules(): Map<string, string> {
    if (!this._renamedModules) {
      this._renamedModules = new Map();
      for (let { root, options } of this.v2Addons.values()) {
        let pkg = this.packageCache.get(root);
        if (pkg.isV2Addon()) {
          let meta = pkg.meta;
          if (options.customizeMeta) {
            // json here is just a super simple clone so the hook can't mutate
            // our cache unintentionally
            meta = options.customizeMeta(JSON.parse(JSON.stringify(meta)));
          }
          let renamedModules = meta['renamed-modules'];
          if (renamedModules) {
            for (let [from, to] of Object.entries(renamedModules)) {
              this._renamedModules.set(from, to);
            }
          }
        }
      }
    }
    return this._renamedModules;
  }

  private makeBundler(allAppTree: Node): Bundler {
    // The Splitter takes the set of imports from the Analyzer and
    // decides which ones to include in which bundles
    let splitter = new Splitter({
      analyzers: this.analyzers,
      bundles: this.bundles,
    });

    let webpack: typeof webpackType;
    const pkg = resolvePackagePath('webpack', this.rootPackage.root);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    if (pkg && semver.satisfies(require(pkg).version, '^5.0.0')) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      webpack = require(resolve.sync('webpack', {
        basedir: this.rootPackage.root,
      })) as typeof webpackType;
    } else {
      throw new Error(
        `[ember-auto-import] this version of ember-auto-import requires the app to have a dependency on webpack 5`
      );
    }

    // The Bundler asks the splitter for deps it should include and
    // is responsible for packaging those deps up.
    return new WebpackBundler(depsFor(allAppTree, this.packages), {
      splitter,
      environment: this.env,
      packages: this.packages,
      consoleWrite: this.consoleWrite,
      bundles: this.bundles,
      webpack,
      rootPackage: this.rootPackage,
    });
  }

  @Memoize()
  private get rootPackage(): Package {
    let rootPackage = [...this.packages.values()].find((pkg) => !pkg.isAddon);
    if (!rootPackage) {
      throw new Error(
        `bug in ember-auto-import, there should always be a Package representing the app`
      );
    }
    return rootPackage;
  }

  addTo(allAppTree: Node): Node {
    let bundler = debugBundler(this.makeBundler(allAppTree), 'output');
    let inserter = new Inserter(allAppTree, bundler, this.bundles, {
      publicAssetURL: this.rootPackage.publicAssetURL(),
      insertScriptsAt: this.rootPackage.insertScriptsAt,
      insertStylesAt: this.rootPackage.insertStylesAt,
    });
    let trees = [allAppTree, bundler, inserter];
    return mergeTrees(trees, { overwrite: true });
  }

  // CAUTION: versions <= 2.1.0 only invoked this method on the app's copy of
  // ember-auto-import, whereas we now invoke it on every copy. That means you
  // can't guarantee this will be called for an addon that is using one of those
  // older versions.
  included(addonInstance: AddonInstance) {
    this.installBabelPlugin(addonInstance);
    if (!isDeepAddonInstance(addonInstance)) {
      this.configureFingerprints(addonInstance.app);
    }
  }

  private installBabelPlugin(addonInstance: AddonInstance): void {
    let parent: AppInstance | AddonInstance;
    if (isDeepAddonInstance(addonInstance)) {
      parent = addonInstance.parent;
    } else {
      parent = addonInstance.app;
    }

    let babelOptions: TransformOptions = (parent.options.babel =
      parent.options.babel || {});
    let babelPlugins = (babelOptions.plugins = babelOptions.plugins || []);
    if (!babelPlugins.some(isAnalyzerPlugin)) {
      // the MARKER is included so that babel caches will invalidate if the
      // MARKER changes
      babelPlugins.unshift([require.resolve('./analyzer-plugin'), { MARKER }]);
    }
  }

  // We need to disable fingerprinting of chunks, because (1) they already
  // have their own webpack-generated hashes and (2) the runtime loader code
  // can't easily be told about broccoli-asset-rev's hashes.
  private configureFingerprints(host: AppInstance) {
    let patterns = ['assets/chunk.*.js', 'assets/chunk.*.css'];
    if (!host.options.fingerprint) {
      host.options.fingerprint = {};
    }
    if (!('exclude' in host.options.fingerprint)) {
      host.options.fingerprint.exclude = patterns;
    } else {
      for (let pattern of patterns) {
        host.options.fingerprint.exclude.push(pattern);
      }
    }
  }
}

function depsFor(allAppTree: Node, packages: Set<Package>) {
  let deps = [allAppTree];
  for (let pkg of packages) {
    let watched = pkg.watchedDirectories;
    if (watched) {
      deps = deps.concat(watched.map((dir) => new WatchedDir(dir)));
      debugWatch(`Adding watched directories: ${watched.join(', ')}`);
    }
  }
  return deps;
}

function isAnalyzerPlugin(entry: unknown) {
  const suffix = path.join('ember-auto-import', 'js', 'analyzer-plugin.js');
  return (
    (typeof entry === 'string' && entry.endsWith(suffix)) ||
    (Array.isArray(entry) &&
      typeof entry[0] === 'string' &&
      entry[0].endsWith(suffix))
  );
}
