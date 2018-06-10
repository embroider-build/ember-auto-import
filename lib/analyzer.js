const Plugin = require('broccoli-plugin');
const walkSync = require('walk-sync');
const fs = require('fs');
const FSTree = require('fs-tree-diff');
const debug = require('debug')('ember-auto-import:analyzer:');
const babelParser = require('@babel/parser');
const { flatten, uniq } = require('lodash');
const symlinkOrCopy = require('symlink-or-copy');
const mkdirp = require('mkdirp');
const { join, dirname } = require('path');

/*
  Analyzer is a pass-through broccoli transform that -- as a
  side-effect -- exposes a `targets` property that lists all the
  discovered imports in the tree.
*/

module.exports = class Analyzer extends Plugin {
  constructor(inputTree, { connectAnalyzer }) {
    super([inputTree], {
      annotation: 'ember-auto-import-analyzer',
      persistentOutput: true
    });
    this._previousTree = new FSTree();
    this._imports = Object.create(null);
    this._targets = [];
    connectAnalyzer(this);
  }

  // This is the API used by our Bundler transform
  get targets() {
    return this._targets;
  }

  build() {
    this._getPatchset().forEach(([operation, path]) => {
      let outputPath = join(this.outputPath, path);
      let inPath  = join(this.inputPaths[0], path);

      switch (operation) {
      case 'unlink':
        this._removeImports(inPath);
        fs.unlinkSync(outputPath);
        break;
      case 'rmdir' :
        fs.rmdirSync(outputPath);
        break;
      case 'mkdir' :
        fs.mkdirSync(outputPath);
        break;
      case 'create':
      case 'change':
        this._updateImports(inPath, fs.readFileSync(inPath, 'utf8'));
        copy(inPath, outputPath);
      }
    });
    this._targets = uniq(flatten(Object.keys(this._imports).map(inPath => Object.keys(this._imports[inPath]))));
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
  debug('doing AMD import analysis');
  head(entry.arguments.filter(function(item) {
    return item.type === 'ArrayExpression';
  })).elements.filter(function(element) {
    return element.value !== 'exports';
  }).forEach(function(element) {
    imports[element.value] = true;
  });
}

function findES6Imports(entry, imports) {
  debug('doing ES6 import analysis');
  let source = entry.source.value;
  imports[source] = true;
}

function copy(sourcePath, destPath) {
  let destDir = dirname(destPath);

  try {
    symlinkOrCopy.sync(sourcePath, destPath);
  } catch (e) {
    if (!fs.existsSync(destDir)) {
      mkdirp.sync(destDir);
    }
    try {
      fs.unlinkSync(destPath);
    } catch (e) {
      // swallow the error
    }
    symlinkOrCopy.sync(sourcePath, destPath);
  }
}
