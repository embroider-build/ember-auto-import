const Plugin = require('broccoli-plugin');
const walkSync = require('walk-sync');
const fs = require('fs');
const FSTree = require('fs-tree-diff');
const debug = require('debug')('ember-auto-import:analyzer:');
const babelParser = require('@babel/parser');
const symlinkOrCopy = require('symlink-or-copy');
const mkdirp = require('mkdirp');
const { join, dirname } = require('path');

/*
  Analyzer discovers and maintains info on all the module imports that
  appear in some number of broccoli trees.
*/
module.exports = class Analyzer  {
  // didAddTree is an optional callback that lets you hear when a new
  // tree is added. It receives the post-analyzed tree as an argument.
  constructor({ didAddTree }) {
    this._modules = Object.create(null);
    this._paths = Object.create(null);
    this._didAddTree = didAddTree;
  }

  // An Object that maps from module names to the list of relative
  // paths in which that module was imported. The relative paths will
  // be prefixed with each tree's label if you provide labels.
  get imports() {
    if (!this._modules) {
      this._modules = groupModules(this._paths);
      debug("imports %j", this._modules);
    }
    return this._modules;
  }

  // A pass-through broccoli transform that (as a side-effect)
  // analyzes all the Javascript in the tree for import
  // statements. You can provide a label to namespace this tree
  // relative to any other trees.
  analyzeTree(tree, label='') {
    let outputTree = new AnalyzerTransform(tree, label, this);
    if (this._didAddTree) {
      this._didAddTree(outputTree);
    }
    return outputTree;
  }
};

class AnalyzerTransform extends Plugin {
  constructor(inputTree, label, analyzer) {
    super([inputTree], {
      annotation: 'ember-auto-import-analyzer',
      persistentOutput: true
    });
    this._label = label;
    this._previousTree = new FSTree();
    this._analyzer = analyzer;
  }

  build() {
    this._getPatchset().forEach(([operation, relativePath]) => {
      let outputPath = join(this.outputPath, relativePath);

      switch (operation) {
      case 'unlink':
        this._removeImports(relativePath);
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
        {
          let absoluteInputPath  = join(this.inputPaths[0], relativePath);
          this._updateImports(relativePath, fs.readFileSync(absoluteInputPath, 'utf8'));
          copy(absoluteInputPath, outputPath);
        }
      }
    });
  }

  _getPatchset() {
    let input = walkSync.entries(this.inputPaths[0], [ '**/*.js' ]);
    let previous  = this._previousTree;
    let next = this._previousTree = FSTree.fromEntries(input);
    return previous.calculatePatch(next);
  }

  _removeImports(relativePath) {
    let labeledPath = join(this._label, relativePath);
    debug(`removing imports for ${labeledPath}`);
    this._analyzer._paths[labeledPath] = null;
    this._analyzer._modules = null; // invalidates analyzer's cache
  }

  _updateImports(relativePath, source) {
    let labeledPath = join(this._label, relativePath);
    debug(`updating imports for ${labeledPath}, ${source.length}`);
    this._analyzer._paths[labeledPath] = this._parseImports(source);
    this._analyzer._modules = null; // invalidates analyzer's cache
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
}


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

function groupModules(paths) {
  let targets = Object.create(null);
  Object.keys(paths).forEach(inPath => {
    Object.keys(paths[inPath]).forEach(module => {
      if (!targets[module]) {
        targets[module] = [];
      }
      targets[module].push(inPath);
    });
  });
  return targets;
}
