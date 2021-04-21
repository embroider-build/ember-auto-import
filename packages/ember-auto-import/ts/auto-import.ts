import Splitter from './splitter';
import { Bundler, debugBundler } from './bundler';
import Analyzer from './analyzer';
import type { TreeType } from './analyzer';
import Package from './package';
import { buildDebugCallback } from 'broccoli-debug';
import BundleConfig from './bundle-config';
import { Node } from 'broccoli-node-api';
import { LeaderChooser } from './leader';
import { AddonInstance, AppInstance, findTopmostAddon, ShallowAddonInstance } from '@embroider/shared-internals';
import WebpackBundler from './webpack';
import { Memoize } from 'typescript-memoize';
import { WatchedDir } from 'broccoli-source';
import { Inserter } from './inserter';
import mergeTrees from 'broccoli-merge-trees';

const debugTree = buildDebugCallback('ember-auto-import');

// This interface must be stable across all versions of ember-auto-import that
// speak the same leader-election protocol. So don't change this unless you know
// what you're doing.
export interface AutoImportSharedAPI {
  isPrimary(addonInstance: AddonInstance): boolean;
  analyze(tree: Node, addon: AddonInstance, treeType?: TreeType): Node;
  included(addonInstance: AddonInstance): void;
  addTo(tree: Node): Node;
}

export default class AutoImport implements AutoImportSharedAPI {
  private packages: Set<Package> = new Set();
  private env: 'development' | 'test' | 'production';
  private consoleWrite: (msg: string) => void;
  private analyzers: Map<Analyzer, Package> = new Map();
  private bundles: BundleConfig;

  static register(addon: AddonInstance) {
    LeaderChooser.for(addon).register(addon, () => new AutoImport(addon));
  }

  static lookup(addon: AddonInstance): AutoImportSharedAPI {
    return LeaderChooser.for(addon).leader;
  }

  constructor(addonInstance: AddonInstance) {
    let topmostAddon = findTopmostAddon(addonInstance);
    this.packages.add(Package.lookupParentOf(topmostAddon));
    let host = topmostAddon.app;
    this.env = host.env;
    this.bundles = new BundleConfig(host);
    if (!this.env) {
      throw new Error('Bug in ember-auto-import: did not discover environment');
    }

    this.consoleWrite = (...args) => addonInstance.project.ui.write(...args);
  }

  // we don't actually call this ourselves anymore, but earlier versions of
  // ember-auto-import will still call it on us. For them the answer is always
  // false.
  isPrimary(_addon: AddonInstance) {
    return false;
  }

  analyze(tree: Node, addon: AddonInstance, treeType?: TreeType) {
    let pack = Package.lookupParentOf(addon);
    this.packages.add(pack);
    let analyzer = new Analyzer(debugTree(tree, `preprocessor:input-${this.analyzers.size}`), pack, treeType);
    this.analyzers.set(analyzer, pack);
    return analyzer;
  }

  private makeBundler(allAppTree: Node): Bundler {
    // The Splitter takes the set of imports from the Analyzer and
    // decides which ones to include in which bundles
    let splitter = new Splitter({
      analyzers: this.analyzers,
      bundles: this.bundles,
    });

    // The Bundler asks the splitter for deps it should include and
    // is responsible for packaging those deps up.
    return new WebpackBundler(depsFor(allAppTree, this.packages), {
      splitter,
      environment: this.env,
      packages: this.packages,
      consoleWrite: this.consoleWrite,
      bundles: this.bundles,
      babelConfig: this.rootPackage.cleanBabelConfig(),
      publicAssetURL: this.publicAssetURL,
    });
  }

  @Memoize()
  private get rootPackage(): Package {
    let rootPackage = [...this.packages.values()].find(pkg => !pkg.isAddon);
    if (!rootPackage) {
      throw new Error(`bug in ember-auto-import, there should always be a Package representing the app`);
    }
    return rootPackage;
  }

  private get publicAssetURL(): string | undefined {
    // Only the app (not an addon) can customize the public asset URL, because
    // it's an app concern.
    return this.rootPackage.publicAssetURL;
  }

  addTo(allAppTree: Node): Node {
    let bundler = debugBundler(this.makeBundler(allAppTree), 'output');
    let inserter = new Inserter(allAppTree, bundler, this.bundles);
    let trees = [allAppTree, bundler, inserter];
    return mergeTrees(trees, { overwrite: true });
  }

  included(addonInstance: ShallowAddonInstance) {
    this.configureFingerprints(addonInstance.app);
  }

  // We need to disable fingerprinting of chunks, because (1) they already
  // have their own webpack-generated hashes and (2) the runtime loader code
  // can't easily be told about broccoli-asset-rev's hashes.
  private configureFingerprints(host: AppInstance) {
    let pattern = 'assets/chunk.*.js';
    if (!host.options.fingerprint) {
      host.options.fingerprint = {};
    }
    if (!('exclude' in host.options.fingerprint)) {
      host.options.fingerprint.exclude = [pattern];
    } else {
      host.options.fingerprint.exclude.push(pattern);
    }
  }
}

function depsFor(allAppTree: Node, packages: Set<Package>) {
  let deps = [allAppTree];
  for (let pkg of packages) {
    let watched = pkg.watchedDirectories;
    if (watched) {
      deps = deps.concat(watched.map(dir => new WatchedDir(dir)));
    }
  }
  return deps;
}
