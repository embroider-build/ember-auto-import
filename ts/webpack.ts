import webpack from 'webpack';
import { join } from 'path';
import { mergeWith } from 'lodash';
import quickTemp from 'quick-temp';
import { writeFileSync } from 'fs';
import { compile, registerHelper } from 'handlebars';
import jsStringEscape from 'js-string-escape';

registerHelper('js-string-escape', jsStringEscape);

const entryTemplate = compile(`
module.exports = (function(){
  {{#each modules as |module|}}
    window.define('{{js-string-escape module.specifier}}', [], function() { return require('{{js-string-escape module.entrypoint}}'); });
  {{/each}}
})();
`);

export default class WebpackBundler {
  private stagingDir;
  private webpack;

  constructor(webpackConfigs, private consoleWrite){
    quickTemp.makeOrRemake(this, 'stagingDir', 'ember-auto-import-webpack');
    let config = {
      entry: join(this.stagingDir, 'entry.js'),
    };
    mergeWith(config, ...webpackConfigs, arrayConcat);
    this.webpack = webpack(config);
  }

  async build(modules){
    this.writeEntryFile(modules);
    await this.runWebpack();
  }

  private writeEntryFile(modules){
    let moduleList = Object.keys(modules).map(specifier => ({ specifier, entrypoint: modules[specifier].entrypoint }));
    writeFileSync(join(this.stagingDir, 'entry.js'), entryTemplate({ modules: moduleList }));
  }

  private async runWebpack(){
    return new Promise((resolve, reject) => {
      this.webpack.run((err, stats) => {
        if (err) {
          this.consoleWrite(stats.toString());
          reject(err);
          return;
        }
        if (stats.hasErrors()) {
          this.consoleWrite(stats.toString());
          reject(new Error('webpack returned errors to ember-auto-import'));
          return;
        }
        if (stats.hasWarnings()) {
          this.consoleWrite(stats.toString());
        }
        resolve();
      });
    });
  }

}

function arrayConcat(objValue, srcValue) {
  if (Array.isArray(objValue)) {
    return objValue.concat(srcValue);
  }
}
