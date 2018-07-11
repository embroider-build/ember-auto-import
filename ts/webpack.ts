import webpack from 'webpack';
import { join } from 'path';
import { merge } from 'lodash';
import quickTemp from 'quick-temp';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
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

  constructor(bundles, outputDir, environment, extraWebpackConfig, private consoleWrite){
    quickTemp.makeOrRemake(this, 'stagingDir', 'ember-auto-import-webpack');

    let entry = {};
    bundles.forEach(bundle => entry[bundle] = join(this.stagingDir, `${bundle}.js`));

    let config = {
      mode: environment === 'production' ? 'production' : 'development',
      entry,
      output: {
        path: join(outputDir, 'ember-auto-import'),
        filename: `[id].js`,
        // this is chosen so we can easily find all the chunks when we want to
        // consume them in fastboot
        chunkFilename: `chunk.[id].js`,
        libraryTarget: 'var',
        library: '__ember_auto_import__'
      },
      optimization: {
        splitChunks: {
          chunks: 'all'
        }
      }
    };
    if (extraWebpackConfig) {
      merge(config, extraWebpackConfig);
    }
    this.webpack = webpack(config);
  }

  async build(bundleDeps: Map<string, BundleDependencies>){
    for (let [bundle, deps] of bundleDeps.entries()) {
      this.writeEntryFile(bundle, deps);
    }
    let stats = await this.runWebpack();
    for (let id of Object.keys(stats.entrypoints)) {
      let entrypoint = stats.entrypoints[id];
      let chunks = entrypoint.chunks.map(chunkId => stats.chunks.find(c => c.id === chunkId));
      chunks.sort(entryFirst);
      let chunkContents = chunks.map(chunk => {
        let filename = join(stats.outputPath, chunk.files[0]);
        let contents = readFileSync(filename, 'utf8');
        unlinkSync(filename);
        return contents;
      });
      writeFileSync(join(stats.outputPath, `combined-${id}.js`), chunkContents.join("\n"), 'utf8');
    }
  }

  private writeEntryFile(name, deps){
    writeFileSync(join(this.stagingDir, `${name}.js`), entryTemplate(deps));
  }

  private async runWebpack() : Promise<any>{
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
        resolve(stats.toJson());
      });
    });
  }

}

function entryFirst(a, b){
  if (a.entry === b.entry) {
    return 0;
  }
  if (a.entry < b.entry) {
    return 1;
  }
  return -1;
}
