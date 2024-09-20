import type { NodePath } from '@babel/traverse';
import type * as t from '@babel/types';
import type * as Babel from '@babel/core';

export default function watermark(babel: { types: typeof t }): Babel.PluginObj {
  return {
    visitor: {
      Identifier(path: NodePath<t.Identifier>) {
        if (path.node.name === '__EAI_WATERMARK__') {
          path.replaceWith(
            babel.types.stringLiteral('successfully watermarked')
          );
        }
      },
    },
  };
}
