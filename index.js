'use strict';

const Analyzer = require('./lib/analyzer');
const DepFinder = require('./lib/dep-finder');
const Bundler = require('./lib/bundler');
const MergeTrees = require('broccoli-merge-trees');
const debugTree = require('broccoli-debug').buildDebugCallback('ember-auto-import');

module.exports = {
  name: 'ember-auto-import',

  setupPreprocessorRegistry(type, registry) {
    // we register on our parent registry (so we will process code
    // from the app or addon that chose to include us) rather than our
    // own registry (which would cause us to process our own code)
    if (type !== 'parent') {
      return;
    }

    registry.add('js', {
      name: 'ember-auto-import-analyzer',
      toTree: (tree, inputPath) => {
        return this._analyzer.analyzeTree(debugTree(tree, `preprocessor:input:${counter++}`), inputPath);
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
    //this.import(`vendor/${this._namespace}/ember-auto-imports-test.js`, { type: 'test' });
  },

  treeForVendor(tree) {

    this._analyzer = new Analyzer({
      didAddTree(tree) {
        // Here be dragons
        bundler.plugin._inputNodes.push(tree);
      }
    });

    // The bundler is responsible for determining which imported
    // modules discovered by the analyzer are external NPM packages
    // that need to be handled by auto-import, and packaging them
    // into AMD-loader compatible format.
    let bundler = new Bundler({
      outputFile: `${this._namespace}/ember-auto-imports.js`,
      depFinder: this._depFinder,
      config: this._options.autoImport,
      analyzer: this._analyzer
    });

    return new MergeTrees([
      tree,
      debugTree(bundler.tree, 'combined')
    ]);
  }
};

let counter = 0;
