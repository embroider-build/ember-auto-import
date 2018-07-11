import Splitter from './splitter';
import Bundler from './bundler';
import MergeTrees from 'broccoli-merge-trees';
import Analyzer from './analyzer';
import Package from './package';
import { buildDebugCallback } from 'broccoli-debug';
import Funnel from 'broccoli-funnel';
import { bundles, bundleForPath } from './bundle-config';

const debugTree = buildDebugCallback('ember-auto-import');
const protocol = '__ember_auto_import_protocol_v1__';

export default class AutoImport{
    private primaryPackage;
    private packages: Set<Package> = new Set();
    private env: string;
    private consoleWrite: (string) => void;
    private analyzers: Map<Analyzer, Package> = new Map();
    private bundlers: Bundler[];
    private tree;

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
        this.bundlers = this.makeBundlers();
    }

    isPrimary(appOrAddon){
        return this.primaryPackage === appOrAddon;
    }

    analyze(tree, appOrAddon){
        let pack = Package.lookup(appOrAddon);
        this.packages.add(pack);
        let analyzer = new Analyzer(debugTree(tree, `preprocessor:input-${this.analyzers.size}`), pack);
        this.analyzers.set(analyzer, pack);
        this.bundlers.forEach(bundler => bundler.unsafeConnect(analyzer));
        return analyzer;
    }

    private makeBundlers() {
        // The Splitter takes the set of imports from the Analyzer and
        // decides which ones to include in which bundles
        let splitter = new Splitter({
            analyzers: this.analyzers,
            bundles,
            bundleForPath
        });

        // The Bundlers ask the splitter for deps they should include and
        // are responsible for packaging those deps up.
        return bundles.map(bundle =>
          new Bundler({
            outputFile: `ember-auto-import/${bundle}.js`,
            splitter,
            bundle,
            environment: this.env,
            packages: this.packages,
            consoleWrite: this.consoleWrite
          })
        );
    }

    private makeTree() {
      if (!this.tree) {
        this.tree = debugTree(new MergeTrees(this.bundlers.map(b => b.tree)), 'output');
      }
      return this.tree;
    }

    treeForVendor(){
      return this.makeTree();
    }

    treeForPublic() {
      return debugTree(new Funnel(this.makeTree(), {
        srcDir: 'ember-auto-import',
        destDir: 'assets',
        exclude: bundles.map(b => `${b}.js`)
      }), 'public');
    }
}
