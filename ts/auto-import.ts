import Splitter from './splitter';
import Bundler from './bundler';
import MergeTrees from 'broccoli-merge-trees';
import Analyzer from './analyzer';
import Package from './package';
import { buildDebugCallback } from 'broccoli-debug';

const debugTree = buildDebugCallback('ember-auto-import');
const testsPattern = new RegExp(`^/?[^/]+/(tests|test-support)/`);
const protocol = '__ember_auto_import_protocol_v1__';

export default class AutoImport{
    private primaryPackage;
    private packages: Set<Package> = new Set();
    private env: string;
    private consoleWrite: (string) => void;
    private analyzers: Map<Analyzer, Package> = new Map();
    private bundlers: Bundler[];
    private appPackage;

    static lookup(autoImportInstance) : AutoImport {
        if (!global[protocol]) {
            global[protocol] = new this(autoImportInstance);
        }
        return global[protocol];
    }

    constructor(autoImportInstance) {
        this.primaryPackage = autoImportInstance;
        // _findHost is private API but it's been stable in ember-cli for two years.
        this.env = autoImportInstance._findHost().env;
        if (!this.env) { throw new Error("Bug in ember-auto-import: did not discover environment"); }

        this.consoleWrite = (...args) => autoImportInstance.project.ui.write(...args);
        this.appPackage = Package.lookupApp(autoImportInstance);
        this.bundlers = this.makeBundlers();
    }

    isPrimary(autoImportInstance){
        return this.primaryPackage === autoImportInstance;
    }

    analyze(tree, autoImportInstance){
        let pack = Package.lookup(autoImportInstance);
        this.packages.add(pack);
        let analyzer = new Analyzer(debugTree(tree, `preprocessor:input`), pack.babelOptions);
        this.analyzers.set(analyzer, pack);
        this.bundlers.forEach(bundler => bundler.unsafeConnect(analyzer));
        return analyzer;
    }

    private makeBundlers() {
        // The Splitter takes the set of imports from the Analyzer and
        // decides which ones to include in which bundles
        let splitter = new Splitter({
            analyzers: this.analyzers,
            bundles: ['app', 'tests'],
            bundleForPath(path) {
                if (testsPattern.test(path)) {
                    return 'tests';
                } else {
                    return 'app';
                }
            }
        });

        // The Bundlers ask the splitter for deps they should include and
        // are responsible for packaging those deps up.

        let appBundler = new Bundler({
          outputFile: `ember-auto-import/app.js`,
          splitter,
          bundle: 'app',
          environment: this.env,
          packages: this.packages,
          consoleWrite: this.consoleWrite,
          babelOptions: this.appPackage.babelOptions
        });

        let testsBundler = new Bundler({
          outputFile: `ember-auto-import/test.js`,
          splitter,
          bundle: 'tests',
          environment: this.env,
          packages: this.packages,
          consoleWrite: this.consoleWrite,
          babelOptions: this.appPackage.babelOptions
        });
        return [appBundler, testsBundler];
    }

    treeForVendor(tree){
        return new MergeTrees([tree].concat(this.bundlers.map(b => b.tree)).filter(Boolean));
    }
}
