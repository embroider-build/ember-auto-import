import type {
  Configuration,
  Compiler,
  RuleSetRule,
  Stats,
  RuleSetUseItem,
  WebpackPluginInstance,
} from 'webpack';
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
import {
  ensureDirSync,
  symlinkSync,
  existsSync,
  outputFileSync,
} from 'fs-extra';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import semver from 'semver';

const debug = makeDebug('ember-auto-import:webpack');

/**
 * Passed to and configuable with autoImport.earlyBootset
 * example:
 * ```js
 * // ember-cli-build.js
 * // ...
 * autoImport: {
 *   earlyBootSet: (defaultModules) => {
 *     return [
 *       ...defaultModules,
 *       'my-package/my-module,
 *     ];
 *   }
 * }
 * ```
 *
 * Anything listed in the return value from this function that is from a v2 addon will be removed.
 * (Allowing each of these packages from the default set to be incrementally converted to v2 addons
 * without the need for this code to be updated)
 *
 */
const DEFAULT_EARLY_BOOT_SET = Object.freeze([
  '@glimmer/tracking',
  '@glimmer/component',
  '@ember/service',
  '@ember/controller',
  '@ember/routing/route',
  '@ember/component',
]);

/**
 * @glimmer/tracking + @glimmer/component
 * are separate addons, yet included in ember-source (for now),
 * but we will be required to use the real glimmer packages before
 * ember-source is converted to v2 (else we implement more hacks at resolver time!)
 */
const BOOT_SET_FROM_EMBER_SOURCE = Object.freeze([
  '@ember/service',
  '@ember/controller',
  '@ember/routing/route',
  '@ember/component',
]);

registerHelper('flatten-file-name', (str) => {
  return flattenFileName(str);
});
registerHelper('js-string-escape', jsStringEscape);
registerHelper('join', function (list, connector) {
  return list.join(connector);
});

const entryTemplate = compile(
  `
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
  {{#each relativeImports as |module|}}
    require('./{{js-string-escape module}}.cjs');
  {{/each}}
  {{#if lazyEngineImports}}
    var engineLookup = window.__eaiEngineLookup || {};
    {{#each lazyEngineImports as |module|}}
    engineLookup['{{module}}'] = function() {
      return import('./{{js-string-escape (flatten-file-name module)}}.cjs')
    };
    {{/each}}
    window.__eaiEngineLookup = engineLookup;
  {{/if}}

  d('__v1-addons__early-boot-set__', [{{{v1EmberDeps}}}], function() {});
  {{#each staticImports as |module|}}
    d('{{js-string-escape module.specifier}}', ['__v1-addons__early-boot-set__'], function() { return require('{{js-string-escape module.specifier}}'); });
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
`,
  { noEscape: true }
) as (args: {
  staticImports: { specifier: string }[];
  dynamicImports: { specifier: string }[];
  staticTemplateImports: { key: string; args: string; template: string }[];
  dynamicTemplateImports: { key: string; args: string; template: string }[];
  relativeImports: { specifier: string }[];
  lazyEngineImports: { specifier: string }[];
  publicAssetURL: string | undefined;
  v1EmberDeps: string;
}) => string;

const emptyTemplate = compile(`
{{#each relativeImports as |module|}}
require('./{{js-string-escape module}}.cjs');
{{/each}}
`) as (args: { relativeImports: { specifier: string }[] }) => string;

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
        join(stagingDir, 'l.cjs'),
        join(stagingDir, `${bundle}.cjs`),
      ];
    });

    let { plugin: stylePlugin, loader: styleLoader } = this.setupStyleLoader();

    let config: Configuration = {
      mode:
        this.opts.environment === 'production' ? 'production' : 'development',
      entry,
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
        removeAvailableModules: this.opts.environment === 'production',
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
          ...removeUndefined([...this.opts.packages].map((pkg) => pkg.aliases))
        ),
      },
      plugins: removeUndefined([stylePlugin]),
      module: {
        noParse: (file: string) => file === join(stagingDir, 'l.cjs'),
        rules: [
          this.babelRule(stagingDir),
          {
            test: /\.css$/i,
            use: [
              styleLoader,
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
    if ([...this.opts.packages].find((pkg) => pkg.forbidsEval)) {
      config.devtool = 'source-map';
    }
    mergeConfig(
      config,
      ...[...this.opts.packages].map((pkg) => pkg.webpackConfig)
    );
    debug('webpackConfig %j', config);
    this.state = { webpack: this.opts.webpack(config), stagingDir };
    return this.state;
  }

  private setupStyleLoader(): {
    loader: RuleSetUseItem;
    plugin: WebpackPluginInstance | undefined;
  } {
    if (this.opts.environment === 'production' || this.opts.hasFastboot) {
      return {
        loader: MiniCssExtractPlugin.loader,
        plugin: new MiniCssExtractPlugin({
          filename: `chunk.[id].[chunkhash].css`,
          chunkFilename: `chunk.[id].[chunkhash].css`,
          ...[...this.opts.packages].find(
            (pkg) => pkg.miniCssExtractPluginOptions
          )?.miniCssExtractPluginOptions,
        }),
      };
    } else
      return {
        loader: {
          loader: 'eai-style-loader',
          options: [...this.opts.packages].find((pkg) => pkg.styleLoaderOptions)
            ?.styleLoaderOptions,
        },
        plugin: undefined,
      };
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
    let shouldTranspile = babelFilter(this.skipBabel(), this.opts.appRoot);

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
    let packageCache = PackageCache.shared(
      'ember-auto-import',
      this.opts.appRoot
    );
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

      if (pkg.meta.externals?.includes(name)) {
        return callback(undefined, 'commonjs ' + request);
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

    this.recursivelyCreateEntryFiles(
      this.opts.bundles.hostProject,
      bundleDeps,
      true
    );
    this.writeLoaderFile();
    this.linkDeps(bundleDeps);
    let stats = await this.runWebpack();
    this.lastBuildResult = this.summarizeStats(stats, bundleDeps);
  }

  private recursivelyCreateEntryFiles(project: any, deps: any, isApp: boolean) {
    let addonNames: string[] = [];
    let lazyEngineNames: string[] = [];

    project.addons.forEach((addon: any) => {
      if (
        addon.options &&
        addon.options.lazyLoading &&
        addon.options.lazyLoading.enabled
      ) {
        // do not flatten the package name as we ember-asest-loader looks up and expects the require statement to match the package name
        // @foo/bar !== @foo-bar.
        lazyEngineNames.push(addon.name);
      } else if (addon.addons.length || deps.get(addon.pkg.name)) {
        // addons can be flattened as they are rolled up into the app, test or engine buckets.
        addonNames.push(flattenFileName(addon.name));
      }

      if (addon.addons.length) {
        this.recursivelyCreateEntryFiles(addon, deps, false);
      }
    });

    if (isApp) {
      this.writeEntryFile('app', deps.get('app')!, addonNames, lazyEngineNames);
      this.writeEntryFile('tests', deps.get('tests')!, ['app'], []);
    } else {
      let name = project.pkg.name;
      let addonName = project.name;
      this.writeEntryFile(
        addonName,
        deps.get(name),
        addonNames,
        lazyEngineNames
      );
    }
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

  private getEarlyBootSet() {
    let result = this.opts.earlyBootSet
      ? this.opts.earlyBootSet([...DEFAULT_EARLY_BOOT_SET])
      : [];

    /**
     * Prior to ember-source 3.27, the modules were precompiled into a variant of requirejs/AMD.
     * As such, the early boot set will not support earlier than 3.27.
     */
    let host = this.opts.rootPackage;
    let emberSource = host.requestedRange('ember-source');
    let emberSourceVersion = semver.valid(emberSource);

    if (emberSourceVersion && semver.lt(emberSourceVersion, '3.27.0')) {
      if (this.opts.earlyBootSet) {
        throw new Error(
          'autoImport.earlyBootSet is not supported for ember-source <= 3.27.0'
        );
      }

      result = [];
    }

    if (!Array.isArray(result)) {
      throw new Error(
        'autoImport.earlyBootSet was used, but did not return an array. An array of strings is required'
      );
    }

    // Reminder: [/* empty array */].every(anything) is true
    if (!result.every((entry) => typeof entry === 'string')) {
      throw new Error(
        'autoImport.earlyBootSet was used, but the returned array did contained data other than strings. Every element in the return array must be a string representing a module'
      );
    }

    /**
     * TODO: iterate over these and check their dependencies if any depend on a v2 addon
     *       - when this situation occurs, check that v2 addon's dependencies if any of those are v1 addons,
     *         - if so, log a warning, about potentially needing to add modules from that v1 addon to the early boot set
     */
    let v2Addons = this.opts.v2Addons.keys();
    let isEmberSourceV2 = this.opts.v2Addons.has('ember-source');

    function depNameForPath(modulePath: string) {
      if (modulePath.startsWith('@')) {
        let [scope, name] = modulePath.split('/');

        return `${scope}/${name}`;
      }

      return modulePath.split('/')[0];
    }

    function isFromEmberSource(modulePath: string) {
      return BOOT_SET_FROM_EMBER_SOURCE.some((fromEmber) =>
        modulePath.startsWith(fromEmber)
      );
    }

    result = result.filter((modulePath) => {
      if (isEmberSourceV2 && isFromEmberSource(modulePath)) {
        return false;
      }

      let depName = depNameForPath(modulePath);

      /**
       * If a dependency from the earlyBootSet is not actually included in the project,
       * don't include in the earlyBootSet emitted content.
       */
      if (!host.hasDependency(depName) && !isFromEmberSource(modulePath)) {
        return false;
      }

      for (let v2Addon of v2Addons) {
        // Omit modulePaths from v2 addons
        if (modulePath.startsWith(v2Addon)) {
          if (!DEFAULT_EARLY_BOOT_SET.includes(v2Addon)) {
            console.warn(
              `\`${modulePath}\` was included in the \`autoImport.earlyBootSet\` list, but belongs to a v2 addon. You can remove this entry from the earlyBootSet`
            );
          }

          return false;
        }
      }

      return true;
    });

    return result;
  }

  private writeEntryFile(
    name: string,
    deps: BundleDependencies,
    relativeImports: any,
    lazyEngineImports: any
  ) {
    let v1EmberDeps = this.getEarlyBootSet();

    if (!existsSync(join(this.stagingDir, name))) {
      if (!deps) {
        outputFileSync(
          join(this.stagingDir, `${flattenFileName(name)}.cjs`),
          emptyTemplate({ relativeImports })
        );
      } else {
        writeFileSync(
          join(this.stagingDir, `${flattenFileName(name)}.cjs`),
          entryTemplate({
            staticImports: deps.staticImports,
            dynamicImports: deps.dynamicImports,
            dynamicTemplateImports:
              deps.dynamicTemplateImports.map(mapTemplateImports),
            staticTemplateImports:
              deps.staticTemplateImports.map(mapTemplateImports),
            relativeImports,
            lazyEngineImports,
            publicAssetURL: this.opts.publicAssetURL,
            v1EmberDeps: v1EmberDeps.map((name) => `'${name}'`).join(','),
          })
        );
      }
    }
  }

  private writeLoaderFile() {
    writeFileSync(join(this.stagingDir, `l.cjs`), loader);
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

  if (key === 'externals') {
    return [srcValue, objValue].flat();
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

// this little helper is needed because typescript can't see through normal
// usage of Array.prototype.filter.
function removeUndefined<T>(list: (T | undefined)[]): T[] {
  return list.filter((item) => typeof item !== 'undefined') as T[];
}

function flattenFileName(path: string) {
  let re = new RegExp('/', 'g');
  return path.replace(re, '-');
}
