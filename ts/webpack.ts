import webpack from 'webpack';
import { join } from 'path';
import { merge } from 'lodash';
import quickTemp from 'quick-temp';
import { writeFileSync } from 'fs';
import { compile, registerHelper } from 'handlebars';
import jsStringEscape from 'js-string-escape';
import { BundleDependencies } from './splitter';
import { BundlerHook, BuildResult } from './bundler';
import BundleConfig from './bundle-config';

registerHelper('js-string-escape', jsStringEscape);

const entryTemplate = compile(`
if (typeof document !== 'undefined') {
  {{#if publicAssetURL}}
  __webpack_public_path__ = '{{js-string-escape publicAssetURL}}';
  {{else}}
  {{!
      locate the webpack lazy loaded chunks relative to the currently executing
      script. The last <script> in DOM should be us, assuming that we are being
      synchronously loaded, which is the normal thing to do. If people are doing
      weirder things than that, they may need to explicitly set a publicAssetURL
      instead.
  }}
  __webpack_public_path__ = (function(){
    var scripts = document.querySelectorAll('script');
    return scripts[scripts.length - 1].src.replace(/\\/[^/]*$/, '/');
  })();
  {{/if}}
}

module.exports = (function(){
  var d = _eai_d;
  var r = _eai_r;
  window.emberAutoImportDynamic = function(specifier) {
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

// this goes in a file by itself so we can tell webpack not to parse it. That
// allows us to grab the "require" and "define" from our enclosing scope without
// webpack messing with them.
//
// It's important that we're using our enclosing scope and not jumping directly
// to window.require (which would be easier), because the enter Ember app may be
// inside a closure with a "require" that isn't the same as "window.require".
const loader = `
window._eai_r = require;
window._eai_d = define;
`;

export default class WebpackBundler implements BundlerHook {
  private stagingDir;
  private webpack;
  private outputDir;

  constructor(
    bundles : BundleConfig,
    environment,
    extraWebpackConfig,
    private consoleWrite,
    private publicAssetURL
  ) {
    quickTemp.makeOrRemake(this, 'stagingDir', 'ember-auto-import-webpack');
    quickTemp.makeOrRemake(this, 'outputDir', 'ember-auto-import-webpack');
    let entry = {};
    bundles.names.forEach(bundle => {
      entry[bundle] = [join(this.stagingDir, 'l.js'), join(this.stagingDir, `${bundle}.js`)];
    });

    let config = {
      mode: environment === 'production' ? 'production' : 'development',
      entry,
      output: {
        path: this.outputDir,
        filename: `chunk.[chunkhash].js`,
        chunkFilename: `chunk.[chunkhash].js`,
        libraryTarget: 'var',
        library: '__ember_auto_import__'
      },
      optimization: {
        splitChunks: {
          chunks: 'all'
        }
      },
      module: {
        noParse: join(this.stagingDir, 'l.js')
      },
    };
    if (extraWebpackConfig) {
      merge(config, extraWebpackConfig);
    }
    this.webpack = webpack(config);
  }

  async build(bundleDeps: Map<string, BundleDependencies>) {
    for (let [bundle, deps] of bundleDeps.entries()) {
      this.writeEntryFile(bundle, deps);
    }
    this.writeLoaderFile();
    let stats = await this.runWebpack();
    return this.summarizeStats(stats);
  }

  private summarizeStats(stats): BuildResult {
    let output = {
      entrypoints: new Map(),
      lazyAssets: [],
      dir: this.outputDir
    };
    let nonLazyAssets = new Set();
    for (let id of Object.keys(stats.entrypoints)) {
      let entrypoint = stats.entrypoints[id];
      output.entrypoints.set(id, entrypoint.assets);
      entrypoint.assets.forEach(asset => nonLazyAssets.add(asset));
    }
    for (let asset of stats.assets) {
      if (!nonLazyAssets.has(asset.name)) {
        output.lazyAssets.push(asset.name);
      }
    }
    return output;
  }

  private writeEntryFile(name, deps) {
    writeFileSync(
      join(this.stagingDir, `${name}.js`),
      entryTemplate({
        staticImports: deps.staticImports,
        dynamicImports: deps.dynamicImports,
        publicAssetURL: this.publicAssetURL
      })
    );
  }

  private writeLoaderFile() {
    writeFileSync(
      join(this.stagingDir, `l.js`),
      loader
    );
  }

  private async runWebpack(): Promise<any> {
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
        if (stats.hasWarnings() || process.env.AUTO_IMPORT_VERBOSE) {
          this.consoleWrite(stats.toString());
        }
        resolve(stats.toJson());
      });
    });
  }
}
