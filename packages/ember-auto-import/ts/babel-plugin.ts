// @ts-ignore
import syntax from 'babel-plugin-syntax-dynamic-import';
import type * as Babel from '@babel/core';
import type { types as t, NodePath } from '@babel/core';
import Package from './package';

function emberAutoImport(babel: typeof Babel) {
  let t = babel.types;
  return {
    inherits: syntax,
    visitor: {
      Import(path: NodePath<t.Import>) {
        let call = path.parentPath as NodePath<t.CallExpression>;
        let arg = call.node.arguments[0];
        if (arg.type === 'StringLiteral') {
          let cat = Package.categorize(arg.value);
          if (cat === 'dep') {
            call.replaceWith(
              t.callExpression(t.identifier('emberAutoImportDynamic'), [arg])
            );
          }
        } else if (arg.type === 'TemplateLiteral') {
          let cat = Package.categorize(arg.quasis[0].value.cooked!, true);
          if (cat === 'dep') {
            call.replaceWith(
              t.callExpression(t.identifier('emberAutoImportDynamic'), [
                t.stringLiteral(
                  arg.quasis.map((q) => q.value.cooked).join('${e}')
                ),
                ...(arg.expressions as t.Expression[]),
              ])
            );
          }
        }
      },
      CallExpression(path: NodePath<t.CallExpression>) {
        let callee = path.get('callee');

        if (
          callee.isIdentifier() &&
          callee.referencesImport('@embroider/macros', 'importSync')
        ) {
          let arg = path.node.arguments[0];
          if (arg.type === 'StringLiteral') {
            let cat = Package.categorize(arg.value);
            if (cat === 'url') {
              throw new Error('You cannot use importSync() with a URL.');
            }
            callee.replaceWith(t.identifier('require'));
          } else if (arg.type === 'TemplateLiteral') {
            let cat = Package.categorize(arg.quasis[0].value.cooked!, true);
            if (cat === 'url') {
              throw new Error('You cannot use importSync() with a URL.');
            }
            path.replaceWith(
              t.callExpression(t.identifier('emberAutoImportSync'), [
                t.stringLiteral(
                  arg.quasis.map((q) => q.value.cooked).join('${e}')
                ),
                ...(arg.expressions as t.Expression[]),
              ])
            );
          }
        }
      },
    },
  };
}

emberAutoImport.baseDir = function () {
  return __dirname;
};

export = emberAutoImport;
