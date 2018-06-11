'use strict';

const Analyzer = require('./lib/analyzer');
const Splitter = require('./lib/splitter');
const DepFinder = require('./lib/dep-finder');
const Bundler = require('./lib/bundler');
const MergeTrees = require('broccoli-merge-trees');
const debugTree = require('broccoli-debug').buildDebugCallback('ember-auto-import');

const testsPattern = new RegExp(`^(/tests)?/[^/]+/(tests|test-support)/`)

module.exports = {
  name: 'ember-auto-import',

  setupPreprocessorRegistry(type, registry) {
    // we register on our parent registry (so we will process code
    // from the app or addon that chose to include us) rather than our
    // own registry (which would cause us to process our own code)
    if (type !== 'parent') {
      return;
    }

    // This is where we hook our analyzer into the build pipeline so
    // it will see all the consumer app or addon's javascript
    registry.add('js', {
      name: 'ember-auto-import-analyzer',
      toTree: (tree, inputPath) => {
        return this._analyzer.analyzeTree(debugTree(tree, `preprocessor:input`), inputPath);
      }
    });
  },

  included() {
    // When consumed by an addon, we will have
    // this.parent.options. When consumed by an app, we will have
    // this.app.options.
    this._usedByAddon = !!this.parent.options;
    this._options = this.parent.options || this.app.options;
    this._depFinder = new DepFinder(this.parent, this._usedByAddon);

    // This namespacing ensures we can be used by multiple packages as
    // well as by an addon and its dummy app simultaneously
    this._namespace = `${this.parent.pkg.name}/${this._usedByAddon ? 'addon' : 'app'}`;

    this.import(`vendor/${this._namespace}/ember-auto-imports.js`);
    this.import(`vendor/${this._namespace}/ember-auto-imports-test.js`, { type: 'test' });
  },

  treeForVendor(tree) {

    // The Analyzer keeps track of all your imports
    this._analyzer = new Analyzer({
      didAddTree(tree) {
        // Here be dragons
        appBundler.plugin._inputNodes.push(tree);
        testsBundler.plugin._inputNodes.push(tree);
      }
    });

    // The Splitter takes the set of imports from the Analyzer and
    // decides which ones to include in which bundles
    let splitter = new Splitter({
      depFinder: this._depFinder,
      config: this._options.autoImport,
      analyzer: this._analyzer,
      bundles: ['app', 'tests'],
      bundleForPath(path) {
        if (testsPattern.test(path)) {
          return 'tests';
        } else {
          return 'app'
        }
      }
    });

    // The Bundlers ask the splitter for deps they should include and
    // are responsible for packaging those deps up.

    let appBundler = new Bundler({
      outputFile: `${this._namespace}/ember-auto-imports.js`,
      splitter,
      bundle: 'app'
    });

    let testsBundler = new Bundler({
      outputFile: `${this._namespace}/ember-auto-imports-test.js`,
      splitter,
      bundle: 'tests'
    });

    return new MergeTrees([
      tree,
      debugTree(appBundler.tree, 'app'),
      debugTree(testsBundler.tree, 'tests')
    ]);
  }
};
