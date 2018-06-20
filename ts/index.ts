'use strict';

import Analyzer from './analyzer';
import Package from './package';
import Splitter from './splitter';
import Bundler from './bundler';
import MergeTrees from 'broccoli-merge-trees';
import { buildDebugCallback } from 'broccoli-debug';
import webpackBundler from './webpack';

const debugTree = buildDebugCallback('ember-auto-import');
const testsPattern = new RegExp(`^/?[^/]+/(tests|test-support)/`);

class PrivateState {
  env: string;
  pack: Package;
  analyzers: Map<Analyzer, Package> = new Map();
  treeAdded: (Tree) => void;

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
      toTree: (tree) => {
        let { analyzers, pack, treeAdded } = privateState.get(this);
        let analyzer = new Analyzer(debugTree(tree, `preprocessor:input`), pack.babelOptions);
        analyzers.set(analyzer, pack);
        treeAdded(analyzer);
        return analyzer;
      }
    });
  },

  included() {
    this._super.included.apply(this, arguments);
    let ps = new PrivateState(this);
    let pack = ps.pack = new Package(this);

    // _findHost is private API but it's been stable in ember-cli for two years.
    ps.env = this._findHost().env;
    if (!ps.env) { throw new Error("Bug in ember-auto-import: did not discover environment"); }

    this.import(`vendor/${pack.namespace}/ember-auto-imports.js`);
    this.import(`vendor/${pack.namespace}/ember-auto-imports-test.js`, { type: 'test' });
  },

  treeForVendor(tree) {
    let ps = privateState.get(this);
    let { pack } = ps;

    // The Splitter takes the set of imports from the Analyzer and
    // decides which ones to include in which bundles
    let splitter = new Splitter({
      config: pack.autoImportOptions,
      analyzers: ps.analyzers,
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
      outputFile: `${pack.namespace}/ember-auto-imports.js`,
      splitter,
      bundle: 'app',
      config: pack.autoImportOptions,
      environment: ps.env,
      consoleWrite: (...args) => this.project.ui.write(...args)
    });

    let testsBundler = new Bundler({
      outputFile: `${pack.namespace}/ember-auto-imports-test.js`,
      splitter,
      bundle: 'tests',
      config: pack.autoImportOptions,
      environment: ps.env,
      consoleWrite: (...args) => this.project.ui.write(...args)
    });

    ps.treeAdded = (tree) => {
      appBundler.unsafeConnect(tree);
      testsBundler.unsafeConnect(tree);
    };

    return new MergeTrees([
      tree,
      debugTree(appBundler.tree, 'app'),
      debugTree(testsBundler.tree, 'tests')
    ].filter(Boolean));
  }
};
