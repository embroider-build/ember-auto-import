import webpack from 'webpack';
import { join, dirname, basename } from 'path';
import { merge } from 'lodash';
import quickTemp from 'quick-temp';
import { writeFileSync } from 'fs';
import { compile, registerHelper } from 'handlebars';
import jsStringEscape from 'js-string-escape';
import { BundleDependencies } from './splitter';
import { BundlerHook } from './bundler';

registerHelper('js-string-escape', jsStringEscape);

const entryTemplate = compile(`
{{! locate the webpack lazy loaded chunks relative to our vendor script }}
{{#if dynamicImports}}
if (typeof document !== 'undefined') {
__webpack_public_path__ = Array.prototype.slice.apply(document.querySelectorAll('script'))
  .find(function(s){ return /\\/vendor/.test(s.src); })
  .src.replace(/\\/vendor.*/, '/');
}
{{/if}}

module.exports = (function(){
  var w = window;
  var d = w.define;
  var r = w.require;
  w.emberAutoImportDynamic = function(specifier) {
    return r('_eai_dyn_' + specifier);
  };
  {{#each staticImports as |module|}}
    d('{{js-string-escape module.specifier}}', [], function() { return require('{{js-string-escape module.entrypoint}}'); });
  {{/each}}
  {{#each dynamicImports as |module|}}
    d('_eai_dyn_{{js-string-escape module.specifier}}', [], function() { return import('{{js-string-escape module.entrypoint}}'); });
  {{/each}}
})();
`);

export default class WebpackBundler implements BundlerHook {
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

  async build(modules: BundleDependencies){
    this.writeEntryFile(modules);
    await this.runWebpack();
  }

  private writeEntryFile(modules){
    writeFileSync(join(this.stagingDir, 'entry.js'), entryTemplate(modules));
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
