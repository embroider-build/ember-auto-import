import Plugin, { Tree } from 'broccoli-plugin';
import walkSync from 'walk-sync';
import { unlinkSync, rmdirSync, mkdirSync, readFileSync, removeSync } from 'fs-extra';
import FSTree from 'fs-tree-diff';
import makeDebug from 'debug';
import { join, extname } from 'path';
import { isEqual, flatten } from 'lodash';
import Package from './package';
import symlinkOrCopy from 'symlink-or-copy';
import { TransformOptions } from '@babel/core';
import { File } from '@babel/types';
import traverse from "@babel/traverse";

makeDebug.formatters.m = (modules: Import[]) => {
  return JSON.stringify(
    modules.map(m => ({
      specifier: m.specifier,
      path: m.path,
      isDynamic: m.isDynamic,
      package: m.package.name
    })),
    null,
    2
  );
};

const debug = makeDebug('ember-auto-import:analyzer');

export interface Import {
  path: string;
  package: Package;
  specifier: string;
  isDynamic: boolean;
}

/*
  Analyzer discovers and maintains info on all the module imports that
  appear in a broccoli tree.
*/
export default class Analyzer extends Plugin {
  private previousTree = new FSTree();
  private modules: Import[] | null = [];
  private paths: Map<string, Import[]> = new Map();

  private parse: undefined | ((source: string) => File);

  constructor(inputTree: Tree, private pack: Package) {
    super([inputTree], {
      annotation: 'ember-auto-import-analyzer',
      persistentOutput: true
    });
  }

  async setupParser(): Promise<void> {
    if (this.parse) {
      return;
    }
    switch (this.pack.babelMajorVersion) {
      case 6:
        this.parse = await babel6Parser(this.pack.babelOptions);
        break;
      case 7:
        this.parse = await babel7Parser(this.pack.babelOptions);
        break;
      default:
        throw new Error(`don't know how to setup a parser for Babel version ${this.pack.babelMajorVersion} (used by ${this.pack.name})`);
    }
  }

  get imports(): Import[] {
    if (!this.modules) {
      this.modules = flatten([...this.paths.values()]);
      debug('imports %m', this.modules);
    }
    return this.modules;
  }

  async build() {
    await this.setupParser();
    this.getPatchset().forEach(([operation, relativePath]) => {
      let outputPath = join(this.outputPath, relativePath);

      switch (operation) {
        case 'unlink':
          if (this.matchesExtension(relativePath)) {
            this.removeImports(relativePath);
          }
          unlinkSync(outputPath);
          break;
        case 'rmdir':
          rmdirSync(outputPath);
          break;
        case 'mkdir':
          mkdirSync(outputPath);
          break;
        case 'change':
          removeSync(outputPath);
          // deliberate fallthrough
        case 'create': {
          let absoluteInputPath = join(this.inputPaths[0], relativePath);
          if (this.matchesExtension(relativePath)) {
            this.updateImports(
              relativePath,
              readFileSync(absoluteInputPath, 'utf8')
            );
          }
          symlinkOrCopy.sync(absoluteInputPath, outputPath);
        }
      }
    });
  }

  private getPatchset() {
    let input = walkSync.entries(this.inputPaths[0]);
    let previous = this.previousTree;
    let next = (this.previousTree = FSTree.fromEntries(input));
    return previous.calculatePatch(next);
  }

  private matchesExtension(path: string) {
    return this.pack.fileExtensions.includes(extname(path).slice(1));
  }

  removeImports(relativePath: string) {
    debug(`removing imports for ${relativePath}`);
    let imports = this.paths.get(relativePath);
    if (imports) {
      if (imports.length > 0) {
        this.modules = null; // invalidates cache
      }
      this.paths.delete(relativePath);
    }
  }

  updateImports(relativePath: string, source: string) {
    debug(`updating imports for ${relativePath}, ${source.length}`);
    let newImports = this.parseImports(relativePath, source);
    if (!isEqual(this.paths.get(relativePath), newImports)) {
      this.paths.set(relativePath, newImports);
      this.modules = null; // invalidates cache
    }
  }

  private parseImports(relativePath :string, source: string): Import[] {
    let ast: File | undefined;
    try {
      ast = this.parse!(source);
    } catch (err) {
      if (err.name !== 'SyntaxError') {
        throw err;
      }
      debug('Ignoring an unparseable file');
    }
    let imports: Import[] = [];
    if (!ast) {
      return imports;
    }

    traverse(ast, {
      CallExpression: (path) => {
        if (path.node.callee.type === 'Import') {
          // it's a syntax error to have anything other than exactly one
          // argument, so we can just assume this exists
          let argument = path.node.arguments[0];

          // Only a limited subset dynamic import syntax is allowed by v2
          // addon package format. It must be either a string literal or a
          // template string.
          if (argument.type !== 'StringLiteral' && argument.type !== 'TemplateLiteral') {
            throw new Error(
              'ember-auto-import only supports dynamic import() that are ' +
              'included in the supported subset of dynamic import syntax ' +
              'of v2 addon format. Only string or template literal arguments ' +
              `are allowed by that specification but ${argument.type} is used.`
            );
          }

          // Only template strings that begin with a static prefix which
          // matches a given list of cases are allowed.
          if (
            argument.type === 'TemplateLiteral'
          ) {
            // A template literal always starts with a static TemplateElement.
            // For a template literal like `${foo}` that TemplateElement is
            // an empty string.
            let prefix =  argument.quasis[0].value.raw;

            if (
              // The static prefix may be an absolute URL either with a given
              // protocol (`http://` or `https://`) or protocol-relative (`//`).
              /(\w+:)?\/\//.test(prefix)
            ) {
              // In this case, Embroider will leave the import() alone. The
              // browser's implementation of import() is used. The contents of
              // the URL is beyond the scope of the Embroider build.
              return;
            } else if (
              // The static prefix is a NPM package name or a relative path.
              (
                // This matches a namespaced NPM package name.
                prefix.startsWith('@') && (prefix.match(/\//) || []).length >= 2
              ) ||
              (
                // This matches an NPM package name without namespace and a
                // relative path.
                !prefix.startsWith('@') && prefix.includes('/')
              )
            ) {
              throw new Error(
                'ember-auto-import does not support dynamic import() with a ' +
                'template literal that references an NPM package or a relative' +
                "path yet even though it's allowed by v2 addon format."
              );
            } else {
              // Only template literals that match one of the cases tested
              // before are supported.
              throw new Error(
                'ember-auto-import only supports dynamic import() that are ' +
                'included in the supported subset of dynamic import syntax ' +
                'of v2 addon format. If the argument given is a template ' +
                'literal that template literal must begin with a static ' +
                'prefix which either identifies it as (1) an absoulte URL, ' +
                '(2) an npm package or (3) a relative path to be supported ' +
                'by v2 addon format. Ember-auto-import does not support (2) ' +
                'and (3) yet.'
              );
            }
          }

          imports.push({
            isDynamic: true,
            specifier: argument.value,
            path: relativePath,
            package: this.pack
          });
        }
      },
      ImportDeclaration: (path) => {
        imports.push({
          isDynamic: false,
          specifier: path.node.source.value,
          path: relativePath,
          package: this.pack
        });
      },
      ExportNamedDeclaration: (path) => {
        if (path.node.source) {
          imports.push({
            isDynamic: false,
            specifier: path.node.source.value,
            path: relativePath,
            package: this.pack
          });
        }
      }
    });
    return imports;
  }
}

async function babel6Parser(babelOptions: unknown): Promise<(source: string) => File> {
  let core = import('babel-core');
  let babylon = import('babylon');

  // missing upstream types (or we are using private API, because babel 6 didn't
  // have a good way to construct a parser directly from the general babel
  // options)
  const { Pipeline, File }  = (await core) as any;
  const { parse } = await babylon;

  let p = new Pipeline();
  let f = new File(babelOptions, p);
  let options = f.parserOpts;

  return function(source) {
    return parse(source, options) as unknown as File;
  };
}

async function babel7Parser(babelOptions: TransformOptions): Promise<(source: string) => File> {
  let core = import('@babel/core');

  const { parseSync } = await core;
  return function(source: string) {
    return parseSync(source, babelOptions) as File;
  };
}
