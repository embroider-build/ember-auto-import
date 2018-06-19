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
  protected parserOptions;
  protected modules = Object.create(null);
  protected paths = Object.create(null);

  static create(babelOptions, didAddTree?: (Tree) => void) : Analyzer {
    return new AnalyzerInternal(babelOptions, didAddTree);
  }

  constructor(babelOptions, private didAddTree) {
    this.parserOptions = this.buildParserOptions(babelOptions);
  }

  private buildParserOptions(babelOptions) {
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
    if (!this.modules) {
      this.modules = groupModules(this.paths);
      debug("imports %j", this.modules);
    }
    return this.modules;
  }

  // A pass-through broccoli transform that (as a side-effect)
  // analyzes all the Javascript in the tree for import
  // statements. You can provide a label to namespace this tree
  // relative to any other trees.
  analyzeTree(tree, label='') : Tree {
    // any typescript experts want to show me a nicer way to avoid this double type assertion?
    let outputTree = new AnalyzerTransform(tree, label, this as any as AnalyzerInternal);
    if (this.didAddTree) {
      this.didAddTree(outputTree);
    }
    return outputTree;
  }
}

class AnalyzerInternal extends Analyzer {
  removeImports(label, relativePath) {
    let labeledPath = join(label, relativePath);
    debug(`removing imports for ${labeledPath}`);
    this.paths[labeledPath] = null;
    this.modules = null; // invalidates cache
  }

  updateImports(label, relativePath, source) {
    let labeledPath = join(label, relativePath);
    debug(`updating imports for ${labeledPath}, ${source.length}`);
    this.paths[labeledPath] = this.parseImports(source);
    this.modules = null; // invalidates cache
  }

  private parseImports(source) {
    let ast = parse(source, this.parserOptions);
    // No need to recurse here, because we only deal with top-level static import declarations
    return ast.program.body.filter(node => node.type === 'ImportDeclaration').map(node => node.source.value);
  }

}

class AnalyzerTransform extends Plugin {
  private previousTree = new FSTree();

  constructor(inputTree: Tree, private label: string, private analyzer: AnalyzerInternal) {
    super([inputTree], {
      annotation: 'ember-auto-import-analyzer',
      persistentOutput: true
    });
  }

  build() {
    this.getPatchset().forEach(([operation, relativePath]) => {
      let outputPath = join(this.outputPath, relativePath);

      switch (operation) {
      case 'unlink':
        this.analyzer.removeImports(this.label, relativePath);
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
          this.analyzer.updateImports(this.label, relativePath, readFileSync(absoluteInputPath, 'utf8'));
          copy(absoluteInputPath, outputPath);
        }
      }
    });
  }

  private getPatchset() {
    let input = walkSync.entries(this.inputPaths[0], [ '**/*.js' ]);
    let previous  = this.previousTree;
    let next = this.previousTree = FSTree.fromEntries(input);
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
