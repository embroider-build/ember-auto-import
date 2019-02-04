import webpack from 'webpack';
import { join } from 'path';
import { mergeWith, flatten } from 'lodash';
import { writeFileSync, realpathSync } from 'fs';
import { compile, registerHelper } from 'handlebars';
import jsStringEscape from 'js-string-escape';
import { BundleDependencies } from './splitter';
import { BundlerHook, BuildResult } from './bundler';
import BundleConfig from './bundle-config';
import { ensureDirSync } from 'fs-extra';

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
// to window.require (which would be easier), because the entire Ember app may be
// inside a closure with a "require" that isn't the same as "window.require".
const loader = `
window._eai_r = require;
window._eai_d = define;
`;

export default class WebpackBundler implements BundlerHook {
  private stagingDir: string;
  private webpack: webpack.Compiler;
  private outputDir: string;

  constructor(
    bundles : BundleConfig,
    environment: 'production' | 'development' | 'test',
    extraWebpackConfig: webpack.Configuration | undefined,
    private consoleWrite: (message: string) => void,
    private publicAssetURL: string | undefined,
    tempArea: string
  ) {
    // resolve the real path, because we're going to do path comparisons later
    // that could fail if this is not canonical.
    tempArea = realpathSync(tempArea);

    this.stagingDir = join(tempArea, 'staging');
    ensureDirSync(this.stagingDir);
    this.outputDir = join(tempArea, 'output');
    ensureDirSync(this.outputDir);
    let entry: { [name: string]: string[] } = {};
    bundles.names.forEach(bundle => {
      entry[bundle] = [join(this.stagingDir, 'l.js'), join(this.stagingDir, `${bundle}.js`)];
    });

    let config: webpack.Configuration = {
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
        noParse: (file) => file === join(this.stagingDir, 'l.js'),
        rules: []
      },
    };
    if (extraWebpackConfig) {
      mergeConfig(config, extraWebpackConfig);
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

  private summarizeStats(_stats: webpack.Stats): BuildResult {
    let stats = _stats.toJson();
    let output = {
      entrypoints: new Map(),
      lazyAssets: [] as string[],
      dir: this.outputDir
    };
    let nonLazyAssets: Set<string> = new Set();
    for (let id of Object.keys(stats.entrypoints)) {
      let entrypoint = stats.entrypoints[id];
      output.entrypoints.set(id, entrypoint.assets);
      entrypoint.assets.forEach((asset: string) => nonLazyAssets.add(asset));
    }
    for (let asset of stats.assets) {
      if (!nonLazyAssets.has(asset.name)) {
        output.lazyAssets.push(asset.name);
      }
    }
    return output;
  }

  private writeEntryFile(name: string, deps: BundleDependencies) {
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

  private async runWebpack(): Promise<webpack.Stats> {
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
        resolve(stats);
      });
    }) as Promise<webpack.Stats>;
  }
}

export function mergeConfig(dest: object, ...srcs: object[]) {
  return mergeWith(dest, ...srcs, combine);
}

function combine(objValue: any, srcValue: any, key: string) {
  if (key === 'noParse') {
    return eitherPattern(objValue, srcValue);
  }

  // arrays concat
  if (Array.isArray(objValue)) {
    return objValue.concat(srcValue);
  }
}

// webpack configs have several places where they accept:
//   - RegExp
//   - [RegExp]
//   - (resource: string) => boolean
//   - string
//   - [string]
// This function combines any of these with a logical OR.
function eitherPattern(...patterns: any[]): (resource: string) => boolean {
  let flatPatterns = flatten(patterns);
  return function(resource) {
    for (let pattern of flatPatterns) {
      if (pattern instanceof RegExp) {
        if (pattern.test(resource)) {
          return true;
        }
      } else if (typeof pattern === 'string') {
        if (pattern === resource) {
          return true;
        }
      } else if (typeof pattern === 'function') {
        if (pattern(resource)) {
          return true;
        }
      }
    }
    return false;
  };
}
