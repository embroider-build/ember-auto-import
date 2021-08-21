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
  return `eaimeta${JSON.stringify(imports)}eaimeta`;
}

export function deserialize(source: string): ImportSyntax[] {
  let index = source.indexOf('eaimeta');
  if (index >= 0) {
    let nextIndex = source.indexOf('eaimeta', index + 1);
    if (nextIndex >= 0) {
      let metaString = source.slice(index + 7, nextIndex);
      let meta: ImportSyntax[] = JSON.parse(metaString);
      return meta;
    }
  }
  return [];
}
