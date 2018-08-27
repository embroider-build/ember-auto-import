import { getOptions } from 'loader-utils';
import stripBom from 'strip-bom';

export default function hbsLoader(templateContent) {
  let { templateCompiler } = getOptions(this);
  try {
    let compiled = templateCompiler.precompile(
      stripBom(templateContent), {
        contents: templateContent,
        moduleName: this.resourcePath
      }
    );
    return `export default Ember.HTMLBars.template(${compiled});`;
  } catch(error) {
    error.type = 'Template Compiler Error';
    error.file = this.resourcePath;
    throw error;
  }
}
