'use strict';

const Analyzer = require('./lib/analyzer');
const DepFinder = require('./lib/dep-finder');
const MergeTrees = require('broccoli-merge-trees');

module.exports = {
  name: 'ember-auto-import',

  included() {
    this._depFinder = new DepFinder(this.project);
  },

  postprocessTree: function(type, tree){
    if (type === 'js'){
      tree = new MergeTrees([
        tree,
        new Analyzer(tree, { depFinder: this._depFinder })
      ]);
    }
    return tree;
  }
};
