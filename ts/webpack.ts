import webpack from 'webpack';
import { join, dirname, basename } from 'path';
import { merge } from 'lodash';
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

  constructor(outputFile, environment, extraWebpackConfig, private consoleWrite){
    quickTemp.makeOrRemake(this, 'stagingDir', 'ember-auto-import-webpack');
    let config = {
      mode: environment === 'production' ? 'production' : 'development',
      entry: join(this.stagingDir, 'entry.js'),
      output: {
        path: dirname(outputFile),
        filename: basename(outputFile),
        libraryTarget: 'var',
        library: '__ember_auto_import__'
      }
    };
    if (extraWebpackConfig) {
      merge(config, extraWebpackConfig);
    }
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
