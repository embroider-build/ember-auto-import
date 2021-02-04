"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const splitter_1 = __importDefault(require("./splitter"));
const bundler_1 = __importDefault(require("./bundler"));
const analyzer_1 = __importDefault(require("./analyzer"));
const package_1 = __importDefault(require("./package"));
const broccoli_debug_1 = require("broccoli-debug");
const bundle_config_1 = __importDefault(require("./bundle-config"));
const broccoli_append_1 = __importDefault(require("./broccoli-append"));
const leader_1 = require("./leader");
const ember_cli_models_1 = require("./ember-cli-models");
const debugTree = broccoli_debug_1.buildDebugCallback('ember-auto-import');
class AutoImport {
    constructor(addonInstance) {
        this.packages = new Set();
        this.analyzers = new Map();
        this.primaryPackage = addonInstance;
        let topmostAddon = ember_cli_models_1.findTopmostAddon(addonInstance);
        this.packages.add(package_1.default.lookupParentOf(topmostAddon));
        let host = topmostAddon.app;
        this.env = host.env;
        this.targets = host.project.targets;
        this.bundles = new bundle_config_1.default(host);
        if (!this.env) {
            throw new Error('Bug in ember-auto-import: did not discover environment');
        }
        this.consoleWrite = (...args) => addonInstance.project.ui.write(...args);
    }
    static register(addon) {
        leader_1.LeaderChooser.for(addon).register(addon, () => new AutoImport(addon));
    }
    static lookup(addon) {
        return leader_1.LeaderChooser.for(addon).leader;
    }
    isPrimary(addon) {
        return this.primaryPackage === addon;
    }
    analyze(tree, addon, treeType) {
        let pack = package_1.default.lookupParentOf(addon);
        this.packages.add(pack);
        let analyzer = new analyzer_1.default(debugTree(tree, `preprocessor:input-${this.analyzers.size}`), pack, treeType);
        this.analyzers.set(analyzer, pack);
        return analyzer;
    }
    makeBundler(allAppTree) {
        // The Splitter takes the set of imports from the Analyzer and
        // decides which ones to include in which bundles
        let splitter = new splitter_1.default({
            analyzers: this.analyzers,
            bundles: this.bundles,
        });
        // The Bundler asks the splitter for deps it should include and
        // is responsible for packaging those deps up.
        return new bundler_1.default(allAppTree, {
            splitter,
            environment: this.env,
            packages: this.packages,
            consoleWrite: this.consoleWrite,
            bundles: this.bundles,
            targets: this.targets,
        });
    }
    addTo(allAppTree) {
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
        return new broccoli_append_1.default(allAppTree, bundler, {
            mappings,
            passthrough,
        });
    }
    included(addonInstance) {
        let host = ember_cli_models_1.findTopmostAddon(addonInstance).app;
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
        host.addonPostprocessTree = (which, tree) => {
            if (which === 'all') {
                tree = this.addTo(tree);
            }
            return original(which, tree);
        };
    }
    // We need to disable fingerprinting of chunks, because (1) they already
    // have their own webpack-generated hashes and (2) the runtime loader code
    // can't easily be told about broccoli-asset-rev's hashes.
    configureFingerprints(host) {
        let pattern = 'assets/chunk.*.js';
        if (!host.options.fingerprint) {
            host.options.fingerprint = {};
        }
        if (!('exclude' in host.options.fingerprint)) {
            host.options.fingerprint.exclude = [pattern];
        }
        else {
            host.options.fingerprint.exclude.push(pattern);
        }
    }
    updateFastBootManifest(manifest) {
        manifest.vendorFiles.push(`${this.bundles.lazyChunkPath}/auto-import-fastboot.js`);
    }
}
exports.default = AutoImport;
//# sourceMappingURL=auto-import.js.map