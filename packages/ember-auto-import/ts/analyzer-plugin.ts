import type { types as t, NodePath } from '@babel/core';
import type * as Babel from '@babel/core';
import { ImportSyntax, serialize } from './analyzer-syntax';

interface State {
  imports: ImportSyntax[];
  handled: WeakSet<t.CallExpression>;
  opts: {
    imports?: ImportSyntax[];
  };
}

// Ignores type-only imports & exports, which are erased from the final build
// output.
// TypeScript: `import type foo from 'foo'`
// Flow: `import typeof foo from 'foo'`
const erasedImportKinds: Set<t.ImportDeclaration['importKind']> = new Set([
  'type',
  'typeof',
]);
// TypeScript: `export type foo from 'foo'`
// Flow: doesn't have type-only exports
const erasedExportKinds: Set<t.ExportNamedDeclaration['exportKind']> = new Set([
  'type',
]);

export = analyzerPlugin;
function analyzerPlugin(babel: typeof Babel) {
  let t = babel.types;
  return {
    visitor: {
      Program: {
        enter(_path: NodePath<t.Program>, state: State) {
          state.imports = state.opts.imports || [];
          state.handled = new WeakSet();
        },
        exit(path: NodePath<t.Program>, state: State) {
          // instead of attaching our comment metadata to an existing node, we
          // add our own tiny harmless node. Otherwise, further processing may
          // drop the node we put our comment on and lose it.
          let meta = t.expressionStatement(t.numericLiteral(0));
          t.addComment(meta, 'trailing', serialize(state.imports), true);
          path.unshiftContainer('body', meta);
        },
      },
      CallExpression(path: NodePath<t.CallExpression>, state: State) {
        if (state.handled.has(path.node)) {
          // We see the same CallExpression multiple times if it has a
          // TemplateLiteral argument and another plugin or preset is rewriting
          // TemplateLiterals to something else. We need to guard against that
          // because the first time is fine and we capture our analysis, but the
          // second time would cause us to throw an exception when we see an
          // illegal argument.
          return;
        }
        let callee = path.get('callee');
        if (callee.type === 'Import') {
          state.imports.push(processImportCallExpression(path, true));
          state.handled.add(path.node);
        } else if (
          callee.isIdentifier() &&
          callee.referencesImport('@embroider/macros', 'importSync')
        ) {
          state.imports.push(processImportCallExpression(path, false));
          state.handled.add(path.node);
        }
      },
      ImportDeclaration(path: NodePath<t.ImportDeclaration>, state: State) {
        if (erasedImportKinds.has(path.node.importKind)) return;
        state.imports.push({
          isDynamic: false,
          specifier: path.node.source.value,
        });
      },
      ExportNamedDeclaration(
        path: NodePath<t.ExportNamedDeclaration>,
        state: State
      ) {
        if (!path.node.source) return;
        if (erasedExportKinds.has(path.node.exportKind)) return;
        state.imports.push({
          isDynamic: false,
          specifier: path.node.source.value,
        });
      },
      ExportAllDeclaration(
        path: NodePath<t.ExportAllDeclaration>,
        state: State
      ) {
        if (erasedExportKinds.has(path.node.exportKind)) return;
        state.imports.push({
          isDynamic: false,
          specifier: path.node.source.value,
        });
      },
    },
  };
}

function processImportCallExpression(
  path: NodePath<t.CallExpression>,
  isDynamic: boolean
): ImportSyntax {
  // it's a syntax error to have anything other than exactly one
  // argument, so we can just assume this exists
  let argument = path.node.arguments[0];

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
          cookedQuasis: argument.quasis.map(
            (templateElement) => templateElement.value.cooked!
          ),
          expressionNameHints: [...argument.expressions].map(inferNameHint),
        };
      }
    default:
      throw path.buildCodeFrameError(
        'import() is only allowed to contain string literals or template string literals'
      );
  }
}

function inferNameHint(exp: t.Expression | t.TSType) {
  if (exp.type === 'Identifier') {
    return exp.name;
  } else {
    return null;
  }
}
