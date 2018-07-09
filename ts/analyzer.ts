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
import { join, dirname, extname } from 'path';
import { isEqual } from 'lodash';

const debug = makeDebug('ember-auto-import:analyzer');

/*
  Analyzer discovers and maintains info on all the module imports that
  appear in a broccoli tree.
*/
export default class Analyzer extends Plugin {
  private previousTree = new FSTree();
  private parserOptions;
  private modules = Object.create(null);
  private paths = Object.create(null);

  constructor(inputTree: Tree, babelOptions) {
    super([inputTree], {
      annotation: 'ember-auto-import-analyzer',
      persistentOutput: true
    });
    this.parserOptions = this.buildParserOptions(babelOptions);
  }

  get imports() {
    if (!this.modules) {
      this.modules = groupModules(this.paths);
      debug("imports %j", this.modules);
    }
    return this.modules;
  }

  private buildParserOptions(babelOptions) {
    let p = new Pipeline();
    let f = new File(babelOptions, p);
    return f.parserOpts;
  }

  build() {
    this.getPatchset().forEach(([operation, relativePath]) => {
      let outputPath = join(this.outputPath, relativePath);

      switch (operation) {
      case 'unlink':
        if (extname(relativePath) === '.js') {
          this.removeImports(relativePath);
        }
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
          if (extname(relativePath) === '.js') {
            this.updateImports(relativePath, readFileSync(absoluteInputPath, 'utf8'));
          }
          copy(absoluteInputPath, outputPath);
        }
      }
    });
  }

  private getPatchset() {
    let input = walkSync.entries(this.inputPaths[0], [ '**/*' ]);
    let previous  = this.previousTree;
    let next = this.previousTree = FSTree.fromEntries(input);
    return previous.calculatePatch(next);
  }

  removeImports(relativePath) {
    debug(`removing imports for ${relativePath}`);
    if (this.paths[relativePath]) {
      if (this.paths[relativePath].length > 0){
        this.modules = null; // invalidates cache
      }
      delete this.paths[relativePath];
    }
  }

  updateImports(relativePath, source) {
    debug(`updating imports for ${relativePath}, ${source.length}`);
    let newImports = this.parseImports(source);
    if (!isEqual(this.paths[relativePath], newImports)) {
      this.paths[relativePath] = newImports;
      this.modules = null; // invalidates cache
    }
  }

  private parseImports(source) {
    let ast;
    try {
      ast = parse(source, this.parserOptions);
    } catch(err){
      if (err.name !== 'SyntaxError') {
        throw err;
      }
      debug('Ignoring an unparseable file');
    }
    if (ast){
      // No need to recurse here, because we only deal with top-level static import declarations
      return ast.program.body.map(node => {
        if (node.type === 'ImportDeclaration'){
          return node.source.value;
        }
        if (node.type === 'ExportNamedDeclaration' && node.source){
          return node.source.value;
        }
      }).filter(Boolean);
    } else {
      return [];
    }
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
