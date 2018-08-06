import Splitter from './splitter';
import Bundler from './bundler';
import Analyzer from './analyzer';
import Package from './package';
import { buildDebugCallback } from 'broccoli-debug';
import { bundles, bundleForPath } from './bundle-config';
import mergeTrees from 'broccoli-merge-trees';

const debugTree = buildDebugCallback('ember-auto-import');
const protocol = '__ember_auto_import_protocol_v1__';

export default class AutoImport{
    private primaryPackage;
    private packages: Set<Package> = new Set();
    private env: string;
    private consoleWrite: (string) => void;
    private analyzers: Map<Analyzer, Package> = new Map();

    static lookup(appOrAddon) : AutoImport {
        if (!global[protocol]) {
            global[protocol] = new this(appOrAddon);
        }
        return global[protocol];
    }

    constructor(appOrAddon) {
        this.primaryPackage = appOrAddon;
        // _findHost is private API but it's been stable in ember-cli for two years.
        this.env = appOrAddon._findHost().env;
        if (!this.env) { throw new Error("Bug in ember-auto-import: did not discover environment"); }

        this.consoleWrite = (...args) => appOrAddon.project.ui.write(...args);
    }

    isPrimary(appOrAddon){
        return this.primaryPackage === appOrAddon;
    }

    analyze(tree, appOrAddon){
        let pack = Package.lookup(appOrAddon);
        this.packages.add(pack);
        let analyzer = new Analyzer(debugTree(tree, `preprocessor:input-${this.analyzers.size}`), pack);
        this.analyzers.set(analyzer, pack);
        return analyzer;
    }

    addTo(allAppTree) {
        // The Splitter takes the set of imports from the Analyzer and
        // decides which ones to include in which bundles
        let splitter = new Splitter({
            analyzers: this.analyzers,
            bundles,
            bundleForPath
        });

        // The Bundler asks the splitter for deps it should include and
        // is responsible for packaging those deps up.
        let bundler = new Bundler(allAppTree, {
          splitter,
          environment: this.env,
          packages: this.packages,
          consoleWrite: this.consoleWrite
        });

        return mergeTrees([
          allAppTree,
          debugTree(bundler, 'output')
        ], { overwrite: true });
    }

    included(addonInstance) {
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
      // So we are forced to monkey patch EmberApp.
      let originalToTree = host.toTree.bind(host);
      host.toTree = (...args) => {
        return this.addTo(originalToTree(...args));
      };
    }

    // We need to disable fingerprinting of chunks, because (1) they already
    // have their own webpack-generated hashes and (2) the runtime loader code
    // can't easily be told about broccoli-asset-rev's hashes.
    private configureFingerprints(host) {
      let pattern = "assets/chunk.*.js";
      if (!host.options.fingerprint) {
        host.options.fingerprint = {};
      }
      if (!host.options.fingerprint.hasOwnProperty('exclude')) {
        host.options.fingerprint.exclude = [pattern];
      } else {
        host.options.fingerprint.exclude.push(pattern);
      }
    }
}
