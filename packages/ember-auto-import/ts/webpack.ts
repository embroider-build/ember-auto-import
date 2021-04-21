import webpack, { Configuration } from 'webpack';
import { join, dirname } from 'path';
import { mergeWith, flatten, zip } from 'lodash';
import { writeFileSync, realpathSync } from 'fs';
import { compile, registerHelper } from 'handlebars';
import jsStringEscape from 'js-string-escape';
import { BundleDependencies, ResolvedImport, ResolvedTemplateImport, sharedResolverOptions } from './splitter';
import { BuildResult, Bundler, BundlerOptions } from './bundler';
import { InputNode } from 'broccoli-node-api';
import Plugin from 'broccoli-plugin';
import { babelFilter } from '@embroider/shared-internals';
import { Options } from './package';
import makeDebug from 'debug';

const debug = makeDebug('ember-auto-import:webpack');

registerHelper('js-string-escape', jsStringEscape);
registerHelper('join', function (list, connector) {
  return list.join(connector);
});

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
    if (arguments.length === 1) {
      return r('_eai_dyn_' + specifier);
    } else {
      return r('_eai_dynt_' + specifier)(Array.prototype.slice.call(arguments, 1))
    }
  };
  window.emberAutoImportSync = function(specifier) {
    {{! this is only used for synchronous importSync() using a template string }}
    return r('_eai_sync_' + specifier)(Array.prototype.slice.call(arguments, 1))
  };
  {{#each staticImports as |module|}}
    d('{{js-string-escape module.specifier}}', [], function() { return require('{{js-string-escape module.entrypoint}}'); });
  {{/each}}
  {{#each dynamicImports as |module|}}
    d('_eai_dyn_{{js-string-escape module.specifier}}', [], function() { return import('{{js-string-escape module.entrypoint}}'); });
  {{/each}}
  {{#each staticTemplateImports as |module|}}
    d('_eai_sync_{{js-string-escape module.key}}', [], function() {
      return function({{module.args}}) {
        return require({{{module.template}}});
      }
    });
  {{/each}}
  {{#each dynamicTemplateImports as |module|}}
    d('_eai_dynt_{{js-string-escape module.key}}', [], function() {
      return function({{module.args}}) {
        return import({{{module.template}}});
      }
    });
  {{/each}}
})();
`) as (args: {
  staticImports: ResolvedImport[];
  dynamicImports: ResolvedImport[];
  staticTemplateImports: { key: string; args: string; template: string }[];
  dynamicTemplateImports: { key: string; args: string; template: string }[];
  publicAssetURL: string | undefined;
}) => string;

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

export default class WebpackBundler extends Plugin implements Bundler {
  private state:
    | {
        webpack: webpack.Compiler;
        stagingDir: string;
      }
    | undefined;

  private lastBuildResult: BuildResult | undefined;

  constructor(priorTrees: InputNode[], private opts: BundlerOptions) {
    super(priorTrees, {
      persistentOutput: true,
      needsCache: true,
      annotation: 'ember-auto-import-webpack',
    });
  }

  get buildResult() {
    if (!this.lastBuildResult) {
      throw new Error(`bug: no buildResult available yet`);
    }
    return this.lastBuildResult;
  }

  private get webpack() {
    return this.setup().webpack;
  }

  private get stagingDir() {
    return this.setup().stagingDir;
  }

  private setup() {
    if (this.state) {
      return this.state;
    }

    // resolve the real path, because we're going to do path comparisons later
    // that could fail if this is not canonical.
    //
    // cast is ok because we passed needsCache to super
    let stagingDir = realpathSync(this.cachePath!);

    let entry: { [name: string]: string[] } = {};
    this.opts.bundles.names.forEach(bundle => {
      entry[bundle] = [join(stagingDir, 'l.js'), join(stagingDir, `${bundle}.js`)];
    });
    let config: Configuration = {
      mode: this.opts.environment === 'production' ? 'production' : 'development',
      entry,
      performance: {
        hints: false,
      },
      output: {
        path: join(this.outputPath, 'assets'),
        publicPath: '',
        filename: `chunk.[id].[chunkhash].js`,
        chunkFilename: `chunk.[id].[chunkhash].js`,
        libraryTarget: 'var',
        library: '__ember_auto_import__',
      },
      optimization: {
        splitChunks: {
          chunks: 'all',
        },
      },
      resolveLoader: {
        alias: {
          // these loaders are our dependencies, not the app's dependencies. I'm
          // not overriding the default loader resolution rules in case the app also
          // wants to control those.
          'babel-loader-8': require.resolve('babel-loader'),
        },
      },
      resolve: {
        ...sharedResolverOptions,
      },
      module: {
        noParse: (file: string) => file === join(stagingDir, 'l.js'),
        rules: [this.babelRule(stagingDir)],
      },
      node: false,
    };

    mergeConfig(config, ...[...this.opts.packages].map(pkg => pkg.webpackConfig));
    if ([...this.opts.packages].find(pkg => pkg.forbidsEval)) {
      config.devtool = 'source-map';
    }
    debug('webpackConfig %j', config);
    this.state = { webpack: webpack(config), stagingDir };
    return this.state;
  }

  private skipBabel(): Required<Options>['skipBabel'] {
    let output: Required<Options>['skipBabel'] = [];
    for (let pkg of this.opts.packages) {
      let skip = pkg.skipBabel;
      if (skip) {
        output = output.concat(skip);
      }
    }
    return output;
  }

  private babelRule(stagingDir: string): webpack.RuleSetRule {
    let shouldTranspile = babelFilter(this.skipBabel());

    return {
      test(filename: string) {
        // We don't apply babel to our own stagingDir (it contains only our own
        // entrypoints that we wrote, and it can use `import()`, which we want
        // to leave directly for webpack).
        //
        // And we otherwise defer to the `skipBabel` setting as implemented by
        // `@embroider/shared-internals`.
        return dirname(filename) !== stagingDir && shouldTranspile(filename);
      },
      use: {
        loader: 'babel-loader-8',
        options: {
          // do not use the host project's own `babel.config.js` file
          configFile: false,
          babelrc: false,

          // leaving this unset can generate an unhelpful warning from babel on
          // large files like 'Note: The code generator has deoptimised the
          // styling of... as it exceeds the max of 500KB."
          generatorOpts: {
            compact: true,
          },

          presets: [
            [
              require.resolve('@babel/preset-env'),
              {
                modules: false,
                targets: this.opts.targets,
              },
            ],
          ],
        },
      },
    };
  }

  async build(): Promise<void> {
    let bundleDeps = await this.opts.splitter.deps();

    for (let [bundle, deps] of bundleDeps.entries()) {
      this.writeEntryFile(bundle, deps);
    }
    this.writeLoaderFile();
    let stats = await this.runWebpack();
    this.lastBuildResult = this.summarizeStats(stats);
  }

  private summarizeStats(_stats: Required<webpack.Stats>): BuildResult {
    let { entrypoints, assets } = _stats.toJson();

    // webpack's types are written rather loosely, implying that these two
    // properties may not be present. They really always are, as far as I can
    // tell, but we need to check here anyway to satisfy the type checker.
    if (!entrypoints) {
      throw new Error(`unexpected webpack output: no entrypoints`);
    }
    if (!assets) {
      throw new Error(`unexpected webpack output: no assets`);
    }

    let output: BuildResult = {
      entrypoints: new Map(),
      lazyAssets: [] as string[],
    };
    let nonLazyAssets: Set<string> = new Set();
    for (let id of Object.keys(entrypoints!)) {
      let { assets: entrypointAssets } = entrypoints![id];
      if (!entrypointAssets) {
        throw new Error(`unexpected webpack output: no entrypoint.assets`);
      }

      this.opts.bundles.assertValidBundleName(id);

      output.entrypoints.set(
        id,
        entrypointAssets.map(a => 'assets/' + a.name)
      );
      entrypointAssets.forEach(asset => nonLazyAssets.add(asset.name));
    }
    for (let asset of assets!) {
      if (!nonLazyAssets.has(asset.name)) {
        output.lazyAssets.push('assets/' + asset.name);
      }
    }
    return output;
  }

  private writeEntryFile(name: string, deps: BundleDependencies) {
    const mapTemplateImports = (imp: ResolvedTemplateImport) => ({
      key: imp.importedBy[0].cookedQuasis.join('${e}'),
      args: imp.expressionNameHints.join(','),
      template:
        '`' +
        zip(imp.cookedQuasis, imp.expressionNameHints)
          .map(([q, e]) => q + (e ? '${' + e + '}' : ''))
          .join('') +
        '`',
    });

    writeFileSync(
      join(this.stagingDir, `${name}.js`),
      entryTemplate({
        staticImports: deps.staticImports,
        dynamicImports: deps.dynamicImports,
        dynamicTemplateImports: deps.dynamicTemplateImports.map(mapTemplateImports),
        staticTemplateImports: deps.staticTemplateImports.map(mapTemplateImports),
        publicAssetURL: this.opts.publicAssetURL,
      })
    );
  }

  private writeLoaderFile() {
    writeFileSync(join(this.stagingDir, `l.js`), loader);
  }

  private async runWebpack(): Promise<Required<webpack.Stats>> {
    return new Promise((resolve, reject) => {
      this.webpack.run((err, stats) => {
        const statsString = stats ? stats.toString() : '';
        if (err) {
          this.opts.consoleWrite(statsString);
          reject(err);
          return;
        }
        if (stats?.hasErrors()) {
          this.opts.consoleWrite(statsString);
          reject(new Error('webpack returned errors to ember-auto-import'));
          return;
        }
        if (stats?.hasWarnings() || process.env.AUTO_IMPORT_VERBOSE) {
          this.opts.consoleWrite(statsString);
        }
        // this cast is justified because we already checked hasErrors above
        resolve(stats as Required<webpack.Stats>);
      });
    }) as Promise<Required<webpack.Stats>>;
  }
}

export function mergeConfig(dest: Configuration, ...srcs: Configuration[]) {
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
  return function (resource) {
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
