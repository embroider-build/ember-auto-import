'use strict';

import Analyzer from './analyzer';
import Splitter from './splitter';
import DepFinder from './dep-finder';
import Bundler from './bundler';
import MergeTrees from 'broccoli-merge-trees';
import { buildDebugCallback } from 'broccoli-debug';
import webpackBundler from './webpack';

const debugTree = buildDebugCallback('ember-auto-import');
const testsPattern = new RegExp(`^(/tests)?/[^/]+/(tests|test-support)/`);

class PrivateState {
  env: string;
  depFinder: DepFinder;
  analyzer: Analyzer;
  babelOptions;
  namespace: string;
  config;

  constructor(publicInstance){
    privateState.set(publicInstance, this);
  }
}

const privateState = new WeakMap<any, PrivateState>();

module.exports = {
  name: 'ember-auto-import',

  // This is exported so apps can import it and use it
  webpackBundler,

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
        let { analyzer } = privateState.get(this);
        return analyzer.analyzeTree(debugTree(tree, `preprocessor:input`), inputPath);
      }
    });
  },

  included() {
    this._super.included.apply(this, arguments);
    let ps = new PrivateState(this);

    // When consumed by an addon, we will have
    // this.parent.options. When consumed by an app, we will have
    // this.app.options.
    let usedByAddon = !!this.parent.options;
    let options = this.parent.options || this.app.options;

    // _findHost is private API but it's been stable in ember-cli for two years.
    ps.env = this._findHost().env;

    if (!ps.env) { throw new Error("Bug in ember-auto-import: did not discover environment"); }
    ps.depFinder = new DepFinder(this.parent, usedByAddon);

    // Generate the same babel options that the consuming app or addon
    // is using. We will use these so we can configure our parser to
    // match.
    let babelAddon = this.addons.find(addon => addon.name === 'ember-cli-babel');
    ps.babelOptions = babelAddon.buildBabelOptions(options);

    // Stash our own config options
    ps.config = options.autoImport || {};
    if (!ps.config.modules) {
      ps.config.modules = Object.create(null);
    }

    // https://github.com/babel/ember-cli-babel/issues/227
    delete ps.babelOptions.annotation;
    delete ps.babelOptions.throwUnlessParallelizable;
    if (ps.babelOptions.plugins) {
      ps.babelOptions.plugins = ps.babelOptions.plugins.filter(p => !p._parallelBabel);
    }

    // This namespacing ensures we can be used by multiple packages as
    // well as by an addon and its dummy app simultaneously
    ps.namespace = `${this.parent.pkg.name}/${usedByAddon ? 'addon' : 'app'}`;

    this.import(`vendor/${ps.namespace}/ember-auto-imports.js`);
    this.import(`vendor/${ps.namespace}/ember-auto-imports-test.js`, { type: 'test' });
  },

  treeForVendor(tree) {
    let ps = privateState.get(this);

    // The Analyzer keeps track of all your imports
    ps.analyzer = Analyzer.create(
      ps.babelOptions,
      (tree) => {
        // Here be dragons
        appBundler.unsafeConnect(tree);
        testsBundler.unsafeConnect(tree);
      }
    );

    // The Splitter takes the set of imports from the Analyzer and
    // decides which ones to include in which bundles
    let splitter = new Splitter({
      depFinder: ps.depFinder,
      config: ps.config,
      analyzer: ps.analyzer,
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
      outputFile: `${ps.namespace}/ember-auto-imports.js`,
      splitter,
      bundle: 'app',
      config: ps.config,
      environment: ps.env,
      consoleWrite: (...args) => this.project.ui.write(...args)
    });

    let testsBundler = new Bundler({
      outputFile: `${ps.namespace}/ember-auto-imports-test.js`,
      splitter,
      bundle: 'tests',
      config: ps.config,
      environment: ps.env,
      consoleWrite: (...args) => this.project.ui.write(...args)
    });

    return new MergeTrees([
      tree,
      debugTree(appBundler.tree, 'app'),
      debugTree(testsBundler.tree, 'tests')
    ].filter(Boolean));
  }
};
