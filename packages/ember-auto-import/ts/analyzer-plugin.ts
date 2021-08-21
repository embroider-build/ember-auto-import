import type { types as t, NodePath } from '@babel/core';
import type * as Babel from '@babel/core';
import { ImportSyntax, serialize } from './analyzer-syntax';

interface State {
  imports: ImportSyntax[];
}

// Ignores type-only imports & exports, which are erased from the final build
// output.
// TypeScript: `import type foo from 'foo'`
// Flow: `import typeof foo from 'foo'`
const erasedImportKinds: Set<t.ImportDeclaration['importKind']> = new Set(['type', 'typeof']);
// TypeScript: `export type foo from 'foo'`
// Flow: doesn't have type-only exports
const erasedExportKinds: Set<t.ExportNamedDeclaration['exportKind']> = new Set(['type']);

export = analyzerPlugin;
function analyzerPlugin(babel: typeof Babel) {
  let t = babel.types;
  return {
    visitor: {
      Program: {
        enter(_path: NodePath<t.Program>, state: State) {
          state.imports = [];
        },
        exit(path: NodePath<t.Program>, state: State) {
          let firstNode = path.node.body[0];
          if (firstNode) {
            t.addComment(firstNode, 'leading', serialize(state.imports), true);
          }
        },
      },
      CallExpression(path: NodePath<t.CallExpression>, state: State) {
        let callee = path.get('callee');
        if (callee.type === 'Import') {
          state.imports.push(processImportCallExpression(path.node.arguments, true));
        } else if (callee.isIdentifier() && callee.referencesImport('@embroider/macros', 'importSync')) {
          state.imports.push(processImportCallExpression(path.node.arguments, false));
        }
      },
      ImportDeclaration(path: NodePath<t.ImportDeclaration>, state: State) {
        if (erasedImportKinds.has(path.node.importKind)) return;
        state.imports.push({
          isDynamic: false,
          specifier: path.node.source.value,
        });
      },
      ExportNamedDeclaration(path: NodePath<t.ExportNamedDeclaration>, state: State) {
        if (!path.node.source) return;
        if (erasedExportKinds.has(path.node.exportKind)) return;
        state.imports.push({
          isDynamic: false,
          specifier: path.node.source.value,
        });
      },
    },
  };
}

function processImportCallExpression(args: t.CallExpression['arguments'], isDynamic: boolean): ImportSyntax {
  // it's a syntax error to have anything other than exactly one
  // argument, so we can just assume this exists
  let argument = args[0];

  switch (argument.type) {
    case 'StringLiteral':
      return {
        isDynamic,
        specifier: argument.value,
      };
    case 'TemplateLiteral':
      if (argument.quasis.length === 1) {
        return {
          isDynamic,
          specifier: argument.quasis[0].value.cooked!,
        };
      } else {
        return {
          isDynamic,
          cookedQuasis: argument.quasis.map(templateElement => templateElement.value.cooked!),
          expressionNameHints: [...argument.expressions].map(inferNameHint),
        };
      }
    default:
      throw new Error('import() is only allowed to contain string literals or template string literals');
  }
}

function inferNameHint(exp: t.Expression | t.TSType) {
  if (exp.type === 'Identifier') {
    return exp.name;
  }
}
