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
      Import(path: NodePath<t.Import>, state: any) {
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
          const importedPathPrefix = arg.quasis[0].value.cooked!;
          let cat = Package.categorize(importedPathPrefix, true);
          if (cat === 'dep') {
            call.replaceWith(
              t.callExpression(t.identifier('emberAutoImportDynamic'), [
                t.stringLiteral(
                  arg.quasis.map((q) => q.value.cooked).join('${e}')
                ),
                ...(arg.expressions as t.Expression[]),
              ])
            );
          } else if (cat === 'local') {
            const resolvePath = state.file.opts.plugins.find(
              (p: any) => p.key === 'module-resolver'
            )?.options?.resolvePath;

            if (!resolvePath) {
              throw new Error(
                `You attempted to dynamically import a relative path in ${state.file.opts.filename} but ember-auto-import was unable to locate the module-resolver plugin. Please file an issue https://github.com/embroider-build/ember-auto-import/issues/new`
              );
            }

            // const sourcePath = path.node.value;
            const currentFile = state.file.opts.filename;
            const modulePath = resolvePath(
              importedPathPrefix,
              currentFile,
              state.opts
            );

            if (modulePath) {
              call.replaceWith(
                t.callExpression(t.identifier('emberAutoImportDynamic'), [
                  t.stringLiteral(
                    arg.quasis
                      .map((q, index) => {
                        // replace the first quasis (importedPathPrefix) with the resolved modulePath
                        if (index === 0) {
                          return modulePath;
                        }
                        return q.value.cooked;
                      })
                      .join('${e}')
                  ),
                  ...(arg.expressions as t.Expression[]),
                ])
              );
            }
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
