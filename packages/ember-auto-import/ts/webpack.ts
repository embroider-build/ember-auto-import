import type { Configuration, Compiler, RuleSetRule, Stats } from 'webpack';
import { join, dirname } from 'path';
import { mergeWith, flatten, zip } from 'lodash';
import { writeFileSync, realpathSync } from 'fs';
import { compile, registerHelper } from 'handlebars';
import jsStringEscape from 'js-string-escape';
import { BundleDependencies, ResolvedTemplateImport } from './splitter';
import { BuildResult, Bundler, BundlerOptions } from './bundler';
import type { InputNode } from 'broccoli-node-api';
import Plugin from 'broccoli-plugin';
import { babelFilter, packageName } from '@embroider/shared-internals';
import { Options } from './package';
import { PackageCache } from '@embroider/shared-internals';
import { Memoize } from 'typescript-memoize';
import makeDebug from 'debug';
import { ensureDirSync, symlinkSync, existsSync } from 'fs-extra';

const debug = makeDebug('ember-auto-import:webpack');

registerHelper('js-string-escape', jsStringEscape);
registerHelper('join', function (list, connector) {
  return list.join(connector);
});

const entryTemplate = compile(`
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
    d('{{js-string-escape module.specifier}}', [], function() { return require('{{js-string-escape module.specifier}}'); });
  {{/each}}
  {{#each dynamicImports as |module|}}
    d('_eai_dyn_{{js-string-escape module.specifier}}', [], function() { return import('{{js-string-escape module.specifier}}'); });
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
  staticImports: { specifier: string }[];
  dynamicImports: { specifier: string }[];
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
        webpack: Compiler;
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
    this.opts.bundles.names.forEach((bundle) => {
      entry[bundle] = [
        join(stagingDir, 'l.js'),
        join(stagingDir, `${bundle}.js`),
      ];
    });
    let config: Configuration = {
      mode:
        this.opts.environment === 'production' ? 'production' : 'development',
      entry,
      // Pursuant to the webpack docs (https://webpack.js.org/configuration/entry-context/#context),
      // we follow the recommendation to set the context, i.e. the absolute path for resolving
      // entry points and loaders from the configuration. By doing this, the config becomes
      // independent of the current working directory, and importantly ensures that we get DETERMINISTIC
      // builds (i.e. produced assets have invariant content across repeated identical builds).
      // If we didn't do this, the module names that webpack considers for computing the deterministic
      // "moduleIds" (using the default moduleIds: "deterministic" option) would end up being
      // based on broccoli temp-directory paths, which aren't deterministic across builds, and would
      // hence cause output assets to also be non-deterministic.
      context: stagingDir,
      performance: {
        hints: false,
      },
      // this controls webpack's own runtime code generation. You still need
      // preset-env to preprocess the libraries themselves (which is already
      // part of this.opts.babelConfig)
      target: `browserslist:${this.opts.browserslist}`,
      output: {
        path: join(this.outputPath, 'assets'),
        publicPath: this.opts.publicAssetURL,
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
          'eai-style-loader': require.resolve('style-loader'),
          'eai-css-loader': require.resolve('css-loader'),
        },
      },
      resolve: {
        extensions: ['.js', '.ts', '.json'],
        mainFields: ['browser', 'module', 'main'],
        alias: Object.assign(
          {},
          ...[...this.opts.packages].map((pkg) => pkg.aliases).filter(Boolean)
        ),
      },
      module: {
        noParse: (file: string) => file === join(stagingDir, 'l.js'),
        rules: [
          this.babelRule(stagingDir),
          {
            test: /\.css$/i,
            use: [
              {
                loader: 'eai-style-loader',
                options: [...this.opts.packages].find(
                  (pkg) => pkg.styleLoaderOptions
                )?.styleLoaderOptions,
              },
              {
                loader: 'eai-css-loader',
                options: [...this.opts.packages].find(
                  (pkg) => pkg.cssLoaderOptions
                )?.cssLoaderOptions,
              },
            ],
          },
        ],
      },
      node: false,
      externals: this.externalsHandler,
    };

    mergeConfig(
      config,
      ...[...this.opts.packages].map((pkg) => pkg.webpackConfig)
    );
    if ([...this.opts.packages].find((pkg) => pkg.forbidsEval)) {
      config.devtool = 'source-map';
    }
    debug('webpackConfig %j', config);
    this.state = { webpack: this.opts.webpack(config), stagingDir };
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

  private babelRule(stagingDir: string): RuleSetRule {
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
        options: this.opts.babelConfig,
      },
    };
  }

  @Memoize()
  private get externalsHandler(): Configuration['externals'] {
    let packageCache = PackageCache.shared('ember-auto-import');
    return function (params, callback) {
      let { context, request } = params;
      if (!context || !request) {
        return callback();
      }

      if (request.startsWith('!')) {
        return callback();
      }
      let name = packageName(request);
      if (!name) {
        // we're only interested in handling inter-package resolutions
        return callback();
      }
      let pkg = packageCache.ownerOfFile(context);
      if (!pkg?.isV2Addon()) {
        // we're only interested in imports that appear inside v2 addons
        return callback();
      }

      try {
        let found = packageCache.resolve(name, pkg);
        if (!found.isEmberPackage() || found.isV2Addon()) {
          // if we're importing a non-ember package or a v2 addon, we don't
          // externalize. Those are all "normal" looking packages that should be
          // resolvable statically.
          return callback();
        } else {
          // the package exists but it is a v1 ember addon, so it's not
          // resolvable at build time, so we externalize it.
          return callback(undefined, 'commonjs ' + request);
        }
      } catch (err) {
        if (err.code !== 'MODULE_NOT_FOUND') {
          throw err;
        }
        // real package doesn't exist, so externalize it
        return callback(undefined, 'commonjs ' + request);
      }
    };
  }

  async build(): Promise<void> {
    let bundleDeps = await this.opts.splitter.deps();

    for (let [bundle, deps] of bundleDeps.entries()) {
      this.writeEntryFile(bundle, deps);
    }
    this.writeLoaderFile();
    this.linkDeps(bundleDeps);
    let stats = await this.runWebpack();
    this.lastBuildResult = this.summarizeStats(stats, bundleDeps);
  }

  private summarizeStats(
    _stats: Required<Stats>,
    bundleDeps: Map<string, BundleDependencies>
  ): BuildResult {
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

      // our built-in bundles can be "empty" while still existing because we put
      // setup code in them, so they get a special check for non-emptiness.
      // Whereas any other bundle that was manually configured by the user
      // should always be emitted.
      if (
        !this.opts.bundles.isBuiltInBundleName(id) ||
        nonEmptyBundle(id, bundleDeps)
      ) {
        output.entrypoints.set(
          id,
          entrypointAssets.map((a) => 'assets/' + a.name)
        );
      }
      entrypointAssets.forEach((asset) => nonLazyAssets.add(asset.name));
    }
    for (let asset of assets!) {
      if (!nonLazyAssets.has(asset.name)) {
        output.lazyAssets.push('assets/' + asset.name);
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
        dynamicTemplateImports:
          deps.dynamicTemplateImports.map(mapTemplateImports),
        staticTemplateImports:
          deps.staticTemplateImports.map(mapTemplateImports),
        publicAssetURL: this.opts.publicAssetURL,
      })
    );
  }

  private writeLoaderFile() {
    writeFileSync(join(this.stagingDir, `l.js`), loader);
  }

  private linkDeps(bundleDeps: Map<string, BundleDependencies>) {
    for (let deps of bundleDeps.values()) {
      for (let resolved of deps.staticImports) {
        this.ensureLinked(resolved);
      }
      for (let resolved of deps.dynamicImports) {
        this.ensureLinked(resolved);
      }
      for (let resolved of deps.staticTemplateImports) {
        this.ensureLinked(resolved);
      }
      for (let resolved of deps.dynamicTemplateImports) {
        this.ensureLinked(resolved);
      }
    }
  }

  private ensureLinked({
    packageName,
    packageRoot,
  }: {
    packageName: string;
    packageRoot: string;
  }): void {
    ensureDirSync(dirname(join(this.stagingDir, 'node_modules', packageName)));
    if (!existsSync(join(this.stagingDir, 'node_modules', packageName))) {
      symlinkSync(
        packageRoot,
        join(this.stagingDir, 'node_modules', packageName),
        'junction'
      );
    }
  }

  private async runWebpack(): Promise<Required<Stats>> {
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
        resolve(stats as Required<Stats>);
      });
    }) as Promise<Required<Stats>>;
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

function mapTemplateImports(imp: ResolvedTemplateImport) {
  return {
    key: imp.importedBy[0].cookedQuasis.join('${e}'),
    args: imp.expressionNameHints.join(','),
    template:
      '`' +
      zip(imp.cookedQuasis, imp.expressionNameHints)
        .map(([q, e]) => q + (e ? '${' + e + '}' : ''))
        .join('') +
      '`',
  };
}

function nonEmptyBundle(
  name: string,
  bundleDeps: Map<string, BundleDependencies>
): boolean {
  let deps = bundleDeps.get(name);
  if (!deps) {
    return false;
  }
  return (
    deps.staticImports.length > 0 ||
    deps.staticTemplateImports.length > 0 ||
    deps.dynamicImports.length > 0 ||
    deps.dynamicTemplateImports.length > 0
  );
}
