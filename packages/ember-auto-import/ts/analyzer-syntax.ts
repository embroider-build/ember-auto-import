export interface LiteralImportSyntax {
  isDynamic: boolean;
  specifier: string;
}

export interface TemplateImportSyntax {
  isDynamic: boolean;
  // these are the string parts of the template literal. The first one always
  // comes before the first expression.
  cookedQuasis: string[];
  // for each of the expressions in between the cookedQuasis, this is an
  // optional hint for what to name the expression that goes there. It's
  // optional because in general there may not be an obvious name, but in
  // practice there often is, and we can aid debuggability by using names that
  // match the original code.
  expressionNameHints: (string | undefined)[];
}

export type ImportSyntax = LiteralImportSyntax | TemplateImportSyntax;

export function serialize(imports: ImportSyntax[]): string {
  let tokens = [];
  for (let imp of imports) {
    if ('specifier' in imp) {
      tokens.push(imp.isDynamic ? 1 : 0);
      tokens.push(imp.specifier);
    } else {
      tokens.push(imp.isDynamic ? 3 : 2);
      tokens.push(imp.cookedQuasis);
      tokens.push(imp.expressionNameHints);
    }
  }
  return `eaimeta${JSON.stringify(tokens).slice(1, -1)}eaimeta`;
}

export function deserialize(source: string): ImportSyntax[] {
  let index = source.indexOf('eaimeta');
  if (index >= 0) {
    let nextIndex = source.indexOf('eaimeta', index + 1);
    if (nextIndex >= 0) {
      let metaString = source.slice(index + 7, nextIndex);
      let tokens = JSON.parse('[' + metaString + ']');
      let meta: ImportSyntax[] = [];
      while (tokens.length > 0) {
        let type = tokens.shift();
        switch (type) {
          case 0:
            meta.push({
              isDynamic: false,
              specifier: tokens.shift(),
            });
            break;
          case 1:
            meta.push({
              isDynamic: true,
              specifier: tokens.shift(),
            });
            break;
          case 2:
            meta.push({
              isDynamic: false,
              cookedQuasis: tokens.shift(),
              expressionNameHints: tokens.shift(),
            });
            break;
          case 3:
            meta.push({
              isDynamic: true,
              cookedQuasis: tokens.shift(),
              expressionNameHints: tokens.shift(),
            });
            break;
        }
      }
      return meta;
    }
  }
  return [];
}
