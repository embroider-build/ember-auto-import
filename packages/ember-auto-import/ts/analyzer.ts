import type { Node } from 'broccoli-node-api';
import { Funnel } from 'broccoli-funnel';
import walkSync from 'walk-sync';
import { createReadStream, readFileSync } from 'fs';
import FSTree from 'fs-tree-diff';
import makeDebug from 'debug';
import { join, extname } from 'path';
import { isEqual, flatten } from 'lodash';
import type Package from './package';
import {
  deserialize,
  ImportSyntax,
  LiteralImportSyntax,
  TemplateImportSyntax,
} from './analyzer-syntax';
import { Memoize } from 'typescript-memoize';

makeDebug.formatters.m = (modules: Import[]) => {
  return JSON.stringify(
    modules.map((m) => {
      if ('specifier' in m) {
        return {
          specifier: m.specifier,
          path: m.path,
          isDynamic: m.isDynamic,
          package: m.package.name,
          treeType: m.treeType,
        };
      } else {
        return {
          cookedQuasis: m.cookedQuasis,
          expressionNameHints: m.expressionNameHints,
          path: m.path,
          isDynamic: m.isDynamic,
          package: m.package.name,
          treeType: m.treeType,
        };
      }
    }),
    null,
    2
  );
};

const debug = makeDebug('ember-auto-import:analyzer');

export type TreeType =
  | 'app'
  | 'addon'
  | 'addon-templates'
  | 'addon-test-support'
  | 'styles'
  | 'templates'
  | 'test';

interface PackageContext {
  path: string;
  package: Package;
  treeType: TreeType | undefined;
}

export type LiteralImport = LiteralImportSyntax & PackageContext;
export type TemplateImport = TemplateImportSyntax & PackageContext;
export type Import = LiteralImport | TemplateImport;

/*
  Analyzer discovers and maintains info on all the module imports that
  appear in a broccoli tree.
*/
export default class Analyzer extends Funnel {
  private previousTree = new FSTree();
  private modules: Import[] | null = [];
  private paths: Map<string, Import[]> = new Map();

  constructor(
    inputTree: Node,
    private pack: Package,
    private treeType: TreeType | undefined,
    private supportsFastAnalyzer: true | undefined
  ) {
    super(inputTree, {
      annotation: 'ember-auto-import-analyzer',
    });
  }

  get imports(): Import[] {
    if (!this.modules) {
      this.modules = flatten([...this.paths.values()]);
      debug('imports %m', this.modules);
    }
    return this.modules;
  }

  async build(...args: unknown[]) {
    await super.build(...args);
    for (let [operation, relativePath] of this.getPatchset()) {
      switch (operation) {
        case 'unlink':
          if (this.matchesExtension(relativePath)) {
            this.removeImports(relativePath);
          }
          break;
        case 'change':
        case 'create': {
          if (this.matchesExtension(relativePath)) {
            await this.updateImports(relativePath);
          }
        }
      }
    }
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

  async updateImports(relativePath: string): Promise<void> {
    let meta: ImportSyntax[];
    if (this.supportsFastAnalyzer) {
      debug(`updating imports for ${relativePath}`);
      let stream = createReadStream(join(this.inputPaths[0], relativePath), {
        encoding: 'utf8',
        // @ts-ignore
        emitClose: true, // Needs to be specified for Node 12, as default is false
      });
      meta = await deserialize(stream);
    } else {
      debug(`updating imports (the slower way) for ${relativePath}`);
      let parse = await this.parser();
      meta = parse(
        readFileSync(join(this.inputPaths[0], relativePath), 'utf8'),
        relativePath
      );
    }

    let newImports = meta.map((m) => ({
      path: relativePath,
      package: this.pack,
      treeType: this.treeType,
      ...m,
    }));

    if (!isEqual(this.paths.get(relativePath), newImports)) {
      this.paths.set(relativePath, newImports);
      this.modules = null; // invalidates cache
    }
  }

  @Memoize()
  async parser(): Promise<
    (source: string, relativePath: string) => ImportSyntax[]
  > {
    if (this.pack.babelMajorVersion !== 7) {
      throw new Error(
        `don't know how to setup a parser for Babel version ${this.pack.babelMajorVersion} (used by ${this.pack.name})`
      );
    }
    const { transformSync } = await import('@babel/core');
    const analyzerPlugin = require.resolve('./analyzer-plugin');

    return (source: string, relativePath: string) => {
      let options = Object.assign({}, this.pack.babelOptions);
      options.code = false;
      options.filename = relativePath;
      if (options.plugins) {
        options.plugins = options.plugins.slice();
      } else {
        options.plugins = [];
      }
      let analyzerOptions: { imports: ImportSyntax[] } = {
        imports: [],
      };
      options.plugins.unshift([analyzerPlugin, analyzerOptions]);
      try {
        transformSync(source, options);
      } catch (err) {
        if (err.name !== 'SyntaxError') {
          throw err;
        }
        debug('Ignoring an unparseable file');
      }
      return analyzerOptions.imports;
    };
  }
}
