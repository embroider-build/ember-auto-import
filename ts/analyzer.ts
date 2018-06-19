import Plugin, { Tree } from 'broccoli-plugin';
import walkSync from  'walk-sync';
import {
  unlinkSync,
  rmdirSync,
  mkdirSync,
  readFileSync,
  existsSync
} from 'fs';
import FSTree from 'fs-tree-diff';
import makeDebug from 'debug';
import { Pipeline, File } from 'babel-core';
import { parse } from 'babylon';
import symlinkOrCopy from 'symlink-or-copy';
import mkdirp from 'mkdirp';
import { join, dirname } from 'path';

const debug = makeDebug('ember-auto-import:analyzer');

/*
  Analyzer discovers and maintains info on all the module imports that
  appear in some number of broccoli trees.
*/
export default class Analyzer  {
  protected _parserOptions;
  protected _modules;
  protected _paths;
  private _didAddTree;

  // didAddTree is an optional callback that lets you hear when a new
  // tree is added. It receives the post-analyzed tree as an argument.
  static create(babelOptions, didAddTree: (Tree) => void) : Analyzer {
    return new AnalyzerInternal(babelOptions, didAddTree);
  }

  constructor(babelOptions, didAddTree) {
    this._parserOptions = this._buildParserOptions(babelOptions);
    this._modules = Object.create(null);
    this._paths = Object.create(null);
    this._didAddTree = didAddTree;
  }

  _buildParserOptions(babelOptions) {
    debug("babel options %j", babelOptions);
    let p = new Pipeline();
    let f = new File(babelOptions, p);
    debug("parser options %j", f.parserOpts);
    return f.parserOpts;
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
  analyzeTree(tree, label='') : Tree {
    let outputTree = new AnalyzerTransform(tree, label, this);
    if (this._didAddTree) {
      this._didAddTree(outputTree);
    }
    return outputTree;
  }
}

class AnalyzerInternal extends Analyzer {
  removeImports(label, relativePath) {
    let labeledPath = join(label, relativePath);
    debug(`removing imports for ${labeledPath}`);
    this._paths[labeledPath] = null;
    this._modules = null; // invalidates cache
  }

  updateImports(label, relativePath, source) {
    let labeledPath = join(label, relativePath);
    debug(`updating imports for ${labeledPath}, ${source.length}`);
    this._paths[labeledPath] = this._parseImports(source);
    this._modules = null; // invalidates cache
  }

  _parseImports(source) {
    let ast = parse(source, this._parserOptions);
    // No need to recurse here, because we only deal with top-level static import declarations
    return ast.program.body.filter(node => node.type === 'ImportDeclaration').map(node => node.source.value);
  }

}

class AnalyzerTransform extends Plugin {
  private _label;
  private _previousTree;
  private _analyzer: AnalyzerInternal;

  constructor(inputTree: Tree, label, analyzer) {
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
        this._analyzer.removeImports(this._label, relativePath);
        unlinkSync(outputPath);
        break;
      case 'rmdir' :
        rmdirSync(outputPath);
        break;
      case 'mkdir' :
        mkdirSync(outputPath);
        break;
      case 'create':
      case 'change':
        {
          let absoluteInputPath  = join(this.inputPaths[0], relativePath);
          this._analyzer.updateImports(this._label, relativePath, readFileSync(absoluteInputPath, 'utf8'));
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

}

function copy(sourcePath, destPath) {
  let destDir = dirname(destPath);

  try {
    symlinkOrCopy.sync(sourcePath, destPath);
  } catch (e) {
    if (!existsSync(destDir)) {
      mkdirp.sync(destDir);
    }
    try {
      unlinkSync(destPath);
    } catch (e) {
      // swallow the error
    }
    symlinkOrCopy.sync(sourcePath, destPath);
  }
}

function groupModules(paths) {
  let targets = Object.create(null);
  Object.keys(paths).forEach(inPath => {
    paths[inPath].forEach(module => {
      if (!targets[module]) {
        targets[module] = [];
      }
      targets[module].push(inPath);
    });
  });
  return targets;
}
