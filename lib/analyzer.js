const Plugin = require('broccoli-plugin');
const walkSync = require('walk-sync');
const fs = require('fs');
const FSTree = require('fs-tree-diff');
const debug = require('debug')('ember-auto-import:analyzer:');
const babelParser = require('@babel/parser');
const { flatten, uniq } = require('lodash');

module.exports = class Analyzer extends Plugin {
  constructor(inputTree, options) {
    super([inputTree], options);
    this._previousTree = new FSTree();
    this._imports = Object.create(null);
    this._targets = [];
  }

  // This is the public API used by our Bundler transform
  get targets() {
    return this._targets;
  }

  build() {
    this._getPatchset().forEach(([operation, path]) => {
      let fullPath  = this.inputPaths[0] + '/' + path;
      switch (operation) {
      case 'unlink':
        this._removeImports(fullPath);
        break;
      case 'create':
      case 'change':
        this._updateImports(fullPath, fs.readFileSync(fullPath, 'utf8'));
      }
    });
    this._targets = uniq(flatten(Object.keys(this._imports).map(fullPath => Object.keys(this._imports[fullPath]))));
    debug("targets %s", this.targets);
  }

  _getPatchset() {
    let input = walkSync.entries(this.inputPaths[0], [ '**/*.js' ]);
    let previous  = this._previousTree;
    let next = this._previousTree = FSTree.fromEntries(input);
    return previous.calculatePatch(next);
  }

  _removeImports(fullPath) {
    debug(`removing imports for ${fullPath}`);
    this._imports[fullPath] = null;
  }

  _updateImports(fullPath, source) {
    debug(`updating imports for ${fullPath}, ${source.length}`);
    this._imports[fullPath] = this._parseImports(source);
  }

  _parseImports(source) {
    let ast = babelParser.parse(source, { sourceType: 'module' });
    let amdImports = {};
    let es6Imports = {};

    forEachNode(ast, function(entry) {
      if (entry.type === 'CallExpression' && entry.callee.name === 'define') {
        findAMDImports(entry, amdImports);
      } else if (entry.type === 'ImportDeclaration') {
        findES6Imports(entry, es6Imports);
      }
    });

    // If any ES6 import statements were found, ignore anything that looked like a module `define` invocation
    if (Object.keys(es6Imports).length) {
      return es6Imports;
    } else {
      return amdImports;
    }
  }
};


function forEachNode(node, visit) {
  if (node && typeof node === 'object' && !node._eb_visited) {
    node._eb_visited = true;
    visit(node);
    let keys = Object.keys(node);
    for (let i=0; i < keys.length; i++) {
      forEachNode(node[keys[i]], visit);
    }
  }
}

function head(array) {
  return array[0];
}

function findAMDImports(entry, imports) {
  head(entry.arguments.filter(function(item) {
    return item.type === 'ArrayExpression';
  })).elements.filter(function(element) {
    return element.value !== 'exports';
  }).forEach(function(element) {
    imports[element.value] = true;
  });
}

function findES6Imports(entry, imports) {
  let source = entry.source.value;
  imports[source] = true;
}
