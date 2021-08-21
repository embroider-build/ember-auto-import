import { Node } from 'broccoli-node-api';
import Plugin from 'broccoli-plugin';
import walkSync from 'walk-sync';
import { unlinkSync, rmdirSync, mkdirSync, readFileSync, removeSync } from 'fs-extra';
import FSTree from 'fs-tree-diff';
import makeDebug from 'debug';
import { join, extname } from 'path';
import { isEqual, flatten } from 'lodash';
import type Package from './package';
import symlinkOrCopy from 'symlink-or-copy';
import { deserialize, LiteralImportSyntax, TemplateImportSyntax } from './analyzer-syntax';

makeDebug.formatters.m = (modules: Import[]) => {
  return JSON.stringify(
    modules.map(m => {
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

export type TreeType = 'app' | 'addon' | 'addon-templates' | 'addon-test-support' | 'styles' | 'templates' | 'test';

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
export default class Analyzer extends Plugin {
  private previousTree = new FSTree();
  private modules: Import[] | null = [];
  private paths: Map<string, Import[]> = new Map();

  constructor(inputTree: Node, private pack: Package, private treeType?: TreeType) {
    super([inputTree], {
      annotation: 'ember-auto-import-analyzer',
      persistentOutput: true,
    });
  }

  get imports(): Import[] {
    if (!this.modules) {
      this.modules = flatten([...this.paths.values()]);
      debug('imports %m', this.modules);
    }
    return this.modules;
  }

  async build() {
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
            this.updateImports(relativePath, readFileSync(absoluteInputPath, 'utf8'));
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

  private parseImports(relativePath: string, source: string): Import[] {
    return deserialize(source).map(m => ({
      path: relativePath,
      package: this.pack,
      treeType: this.treeType,
      ...m,
    }));
  }
}
