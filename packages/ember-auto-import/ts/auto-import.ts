import Splitter from './splitter';
import Bundler from './bundler';
import Analyzer from './analyzer';
import Package from './package';
import { buildDebugCallback } from 'broccoli-debug';
import BundleConfig from './bundle-config';
import Append from './broccoli-append';
import { Tree } from 'broccoli-plugin';

const debugTree = buildDebugCallback('ember-auto-import');
const protocol = '__ember_auto_import_protocol_v1__';

export default class AutoImport {
  private primaryPackage: any;
  private packages: Set<Package> = new Set();
  private env: 'development' | 'test' | 'production';
  private consoleWrite: (msg: string) => void;
  private analyzers: Map<Analyzer, Package> = new Map();
  private bundles: BundleConfig;
  private targets: unknown;

  static lookup(appOrAddon: any): AutoImport {
    let g = global as any;
    if (!g[protocol]) {
      g[protocol] = new this(appOrAddon);
    }
    return g[protocol];
  }

  constructor(appOrAddon: any) {
    function findHostContext(appOrAddon: any): any {
      return appOrAddon.parent.parent
        ? findHostContext(appOrAddon.parent)
        : appOrAddon;
    }

    this.primaryPackage = appOrAddon;
    let hostContext = findHostContext(appOrAddon);
    this.packages.add(Package.lookup(hostContext));
    let host = hostContext.app;
    this.env = host.env;
    this.targets = host.project.targets;
    this.bundles = new BundleConfig(host);
    if (!this.env) {
      throw new Error('Bug in ember-auto-import: did not discover environment');
    }

    this.consoleWrite = (...args) => appOrAddon.project.ui.write(...args);
  }

  isPrimary(appOrAddon: any) {
    return this.primaryPackage === appOrAddon;
  }

  analyze(tree: Tree, appOrAddon: any) {
    let pack = Package.lookup(appOrAddon);
    this.packages.add(pack);
    let analyzer = new Analyzer(
      debugTree(tree, `preprocessor:input-${this.analyzers.size}`),
      pack
    );
    this.analyzers.set(analyzer, pack);
    return analyzer;
  }

  makeBundler(allAppTree: Tree) {
    // The Splitter takes the set of imports from the Analyzer and
    // decides which ones to include in which bundles
    let splitter = new Splitter({
      analyzers: this.analyzers,
      bundles: this.bundles,
    });

    // The Bundler asks the splitter for deps it should include and
    // is responsible for packaging those deps up.
    return new Bundler(allAppTree, {
      splitter,
      environment: this.env,
      packages: this.packages,
      consoleWrite: this.consoleWrite,
      bundles: this.bundles,
      targets: this.targets,
    });
  }

  addTo(allAppTree: Tree) {
    let bundler = debugTree(this.makeBundler(allAppTree), 'output');

    let mappings = new Map();
    for (let name of this.bundles.names) {
      let byType = new Map();
      mappings.set(`entrypoints/${name}`, byType);
      for (let type of this.bundles.types) {
        let target = this.bundles.bundleEntrypoint(name, type);
        byType.set(type, target);
      }
    }

    let passthrough = new Map();
    passthrough.set('lazy', this.bundles.lazyChunkPath);

    return new Append(allAppTree, bundler, {
      mappings,
      passthrough,
    });
  }

  included(addonInstance: any) {
    let host = addonInstance._findHost();
    this.configureFingerprints(host);

    // ember-cli as of 3.4-beta has introduced architectural changes that make
    // it impossible for us to nicely emit the built dependencies via our own
    // vendor and public trees, because it now considers those as *inputs* to
    // the trees that we analyze, causing a circle, even though there is no
    // real circular data dependency.
    //
    // We also cannot use postprocessTree('all'), because that only works in
    // first-level addons.
    //
    // So we are forced to monkey patch EmberApp. We insert ourselves right at
    // the beginning of addonPostprocessTree.
    let original = host.addonPostprocessTree.bind(host);
    host.addonPostprocessTree = (which: string, tree: Tree) => {
      if (which === 'all') {
        tree = this.addTo(tree);
      }
      return original(which, tree);
    };
  }

  // We need to disable fingerprinting of chunks, because (1) they already
  // have their own webpack-generated hashes and (2) the runtime loader code
  // can't easily be told about broccoli-asset-rev's hashes.
  private configureFingerprints(host: any) {
    let pattern = 'assets/chunk.*.js';
    if (!host.options.fingerprint) {
      host.options.fingerprint = {};
    }
    if (!host.options.fingerprint.hasOwnProperty('exclude')) {
      host.options.fingerprint.exclude = [pattern];
    } else {
      host.options.fingerprint.exclude.push(pattern);
    }
  }

  updateFastBootManifest(manifest: { vendorFiles: string[] }) {
    manifest.vendorFiles.push(
      `${this.bundles.lazyChunkPath}/auto-import-fastboot.js`
    );
  }
}
