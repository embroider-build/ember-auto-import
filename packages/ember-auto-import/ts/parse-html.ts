// this is just a wrapper around parse5. We need a wrapper because parse5's
// types are quite bad. Both because they're not sensibly designed, and because
// they're out of date with its implementation.

import parse5 from 'parse5';

export function parse(html: string): parse5.AST.Default.Document {
  return parse5.parse(html, { sourceCodeLocationInfo: true } as any) as parse5.AST.Default.Document;
}

export type Element = parse5.AST.Default.Element & {
  sourceCodeLocation: {
    startOffset: number;
    endOffset: number;
  };
};

export function traverse(node: parse5.AST.Default.ParentNode, fn: (elt: Element) => void) {
  if ('tagName' in node) {
    fn(node);
  }

  for (let child of node.childNodes) {
    if ('childNodes' in child) {
      traverse(child, fn);
    }
  }
}
