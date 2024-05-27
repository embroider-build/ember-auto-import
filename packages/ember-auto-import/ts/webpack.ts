import type {
  Configuration,
  Compiler,
  RuleSetRule,
  Stats,
  RuleSetUseItem,
  WebpackPluginInstance,
  Module,
} from 'webpack';
import { join, dirname, resolve, relative, posix, isAbsolute } from 'path';
import { createHash } from 'crypto';
import { mergeWith, flatten, zip } from 'lodash';
import { writeFileSync, realpathSync, readFileSync } from 'fs';
import { compile, registerHelper } from 'handlebars';
import jsStringEscape from 'js-string-escape';
import { BundleDependencies, ResolvedTemplateImport } from './splitter';
import { BuildResult, Bundler, BundlerOptions } from './bundler';
import type { InputNode } from 'broccoli-node-api';
import Plugin from 'broccoli-plugin';
import { babelFilter, packageName, Package } from '@embroider/shared-internals';
import { Options } from './package';
import { PackageCache } from '@embroider/shared-internals';
import { Memoize } from 'typescript-memoize';
import makeDebug from 'debug';
import { ensureDirSync, symlinkSync, existsSync } from 'fs-extra';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import minimatch from 'minimatch';
import { TransformOptions } from '@babel/core';
import { stripQuery } from './util';

const EXTENSIONS = ['.js', '.ts', '.json'];

const debug = makeDebug('ember-auto-import:webpack');

registerHelper('js-string-escape', jsStringEscape);
registerHelper('join', function (list, connector) {
  return list.join(connector);
});

const moduleIdMap = new Map<string, string>();

function moduleToId(moduleSpecifier: string) {
  let id = moduleSpecifier;

  // if the module contains characters that need to be escaped, then map this to a hash instead, so we can easily replace this later
  if (moduleSpecifier.includes('"') || moduleSpecifier.includes("'")) {
    id = createHash('md5').update('some_string').digest('hex');

    moduleIdMap.set(id, moduleSpecifier);
  }

  return id;
}

function idToModule(id: string) {
  return moduleIdMap.get(id) ?? id;
}

registerHelper('module-to-id', moduleToId);

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
  {{!- es compatibility. Where we're using "require", webpack doesn't necessarily know to apply its own ES compatibility stuff -}}
  function esc(m) {
    return m && m.__esModule ? m : Object.assign({ default: m }, m);
  }
  {{#each staticImports as |module|}}
    d('{{js-string-escape module.specifier}}', EAI_DISCOVERED_EXTERNALS('{{module-to-id module.specifier}}'), function() { return esc(require('{{js-string-escape module.specifier}}')); });
  {{/each}}
  {{#each dynamicImports as |module|}}
    d('_eai_dyn_{{js-string-escape module.specifier}}', [], function() { return import('{{js-string-escape module.specifier}}'); });
  {{/each}}
  {{#each staticTemplateImports as |module|}}
    d('_eai_sync_{{js-string-escape module.key}}', [], function() {
      return function({{module.args}}) {
        return esc(require({{{module.template}}}));
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
  publicAssetURL: string | undefined;
}) => string;

const strictEntryTemplate = compile(
  `
{{#each staticImports as |module index|}}
  {{../strictLoaderKey}}.register('{{js-string-escape module.specifier}}', EAI_DISCOVERED_EXTERNALS('{{module-to-id module.specifier}}'), (_export, _context) => ({
    async execute() {
      {{! this is a webpack-handled import. It's intentionally not
          _context.import, which would be a systemjs import. !}}
      _export(await import("{{js-string-escape module.specifier}}"));
    } 
  }));
{{/each}}
`,
  { noEscape: true }
) as (args: {
  staticImports: { specifier: string }[];
  strictLoaderKey: string;
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
      let config: string[];
      if (this.opts.strictLoaderKey) {
        config = [join(stagingDir, `${bundle}.mjs`)];
      } else {
        config = [join(stagingDir, 'l.cjs'), join(stagingDir, `${bundle}.cjs`)];
      }
      entry[bundle] = config;
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
      target: `browserslist:${this.opts.rootPackage.browserslist()}`,
      output: {
        path: join(this.outputPath, 'assets'),
        publicPath: this.opts.rootPackage.publicAssetURL(),
        filename: `chunk.[id].[chunkhash].js`,
        chunkFilename: `chunk.[id].[chunkhash].js`,
        library: {
          name: '__ember_auto_import__',
          type: 'var',
        },
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
        extensions: EXTENSIONS,
        mainFields: ['browser', 'module', 'main'],
        alias: Object.assign(
          {
            // this is because of the allowAppImports feature needs to be able to import things
            // like app-name/lib/something from within webpack handled code but that needs to be
            // able to resolve to app-root/app/lib/something.
            [this.opts.rootPackage.name]: `${this.opts.rootPackage.root}/app`,
          },
          ...removeUndefined([...this.opts.packages].map((pkg) => pkg.aliases))
        ),
      },
      plugins: removeUndefined([stylePlugin]),
      module: {
        noParse: (file: string) => file === join(stagingDir, 'l.cjs'),
        rules: [
          this.babelRule(
            stagingDir,
            (filename) => !this.fileIsInApp(filename),
            this.opts.rootPackage.cleanBabelConfig()
          ),
          this.babelRule(
            stagingDir,
            (filename) => this.fileIsInApp(filename),
            this.opts.rootPackage.babelOptions
          ),
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
    if (
      this.opts.environment === 'production' ||
      this.opts.rootPackage.isFastBootEnabled
    ) {
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

  private fileIsInApp(filename: string) {
    let packageCache = PackageCache.shared(
      'ember-auto-import',
      this.opts.rootPackage.root
    );

    const pkg = packageCache.ownerOfFile(filename);

    return pkg?.root === this.opts.rootPackage.root;
  }

  private babelRule(
    stagingDir: string,
    filter: (filename: string) => boolean,
    babelConfig: TransformOptions
  ): RuleSetRule {
    let shouldTranspile = babelFilter(
      this.skipBabel(),
      this.opts.rootPackage.root
    );

    return {
      test: (filename: string) => {
        // We don't apply babel to our own stagingDir (it contains only our own
        // entrypoints that we wrote, and it can use `import()`, which we want
        // to leave directly for webpack).
        //
        // And we otherwise defer to the `skipBabel` setting as implemented by
        // `@embroider/shared-internals`.
        return (
          dirname(filename) !== stagingDir &&
          shouldTranspile(filename) &&
          filter(filename)
        );
      },
      use: {
        loader: 'babel-loader-8',
        options: babelConfig,
      },
    };
  }

  private externalizedByUs = new Set<string>();

  @Memoize()
  private get externalsHandler(): Configuration['externals'] {
    let packageCache = PackageCache.shared(
      'ember-auto-import',
      this.opts.rootPackage.root
    );

    let externalType = this.opts.strictLoaderKey
      ? (id: string) =>
          /* the externals we're getting from systemjs are always formatted as
          modules. But webpack doesn't automatically have any interop for them,
          so we need to mark them here.

          The syntax here is weird, but only because the webpack-ism here is
          that we're returning an eternalType of "promise" followed by an
          arbitrary javascript expression that's supposed to result in a promise
          that gives back the external module.
          */
          `promise (async () => { let m = await ${this.opts.strictLoaderKey}.import('${id}'); m.__esModule = true; return m })()`
      : (id: string) => `commonjs ${id}`;

    return (params, callback) => {
      let { context, request, contextInfo } = params;
      if (!context || !request) {
        return callback();
      }

      if (request.startsWith('!')) {
        return callback();
      }

      let pkg = packageCache.ownerOfFile(context);
      if (!pkg) {
        // we're not inside any identifiable NPM package
        return callback();
      }

      let name = packageName(request);
      if (!name) {
        if (!isAbsolute(request) && pkg.root === this.opts.rootPackage.root) {
          let appRelativeContext = relative(
            resolve(this.opts.rootPackage.root, 'app'),
            context
          );

          name = this.opts.rootPackage.name;
          let candidateName = posix.join(name, appRelativeContext, request);
          if (candidateName.startsWith(name)) {
            request = candidateName;
          } else {
            // the relative request does not target the traditional "app" dir
            return callback();
          }
        } else {
          // we're only interested in handling inter-package resolutions
          return callback();
        }
      }

      // Handling full-name imports that point at the app itself e.g. app-name/lib/thingy
      if (name === this.opts.rootPackage.name) {
        if (
          this.importMatchesAppImports(
            stripQuery(request.slice(name.length + 1))
          )
        ) {
          // webpack should handle this because it's another file in the app that matches allowAppImports
          return callback();
        } else {
          // use ember's module because this is part of the app that doesn't match allowAppImports
          this.externalizedByUs.add(request);
          return callback(undefined, externalType(request));
        }
      }

      // if we're not in a v2 addon and the file that is doing the import doesn't match one of the allowAppImports patterns
      // then we don't implement the "fallback behaviour" below i.e. this won't be handled by ember-auto-import
      if (
        !pkg.isV2Addon() &&
        !this.matchesAppImports(pkg, contextInfo?.issuer)
      ) {
        return callback();
      }

      if (pkg.isV2Addon() && pkg.meta.externals?.includes(name)) {
        this.externalizedByUs.add(request);
        return callback(undefined, externalType(request));
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
          this.externalizedByUs.add(request);
          return callback(undefined, externalType(request));
        }
      } catch (err) {
        if (err.code !== 'MODULE_NOT_FOUND') {
          throw err;
        }
        // real package doesn't exist, so externalize it
        this.externalizedByUs.add(request);
        return callback(undefined, externalType(request));
      }
    };
  }

  *withResolvableExtensions(
    importSpecifier: string
  ): Generator<string, void, void> {
    if (importSpecifier.match(/\.\w+$/)) {
      yield importSpecifier;
    } else {
      for (let ext of EXTENSIONS) {
        yield `${importSpecifier}${ext}`;
      }
    }
  }

  importMatchesAppImports(relativeImportSpecifier: string): boolean {
    for (let candidate of this.withResolvableExtensions(
      relativeImportSpecifier
    )) {
      if (
        this.opts.rootPackage.allowAppImports.some((pattern) =>
          minimatch(candidate, pattern)
        )
      ) {
        return true;
      }
    }
    return false;
  }

  matchesAppImports(pkg: Package, requestingFile: string | undefined): boolean {
    if (!requestingFile) {
      return false;
    }

    if (pkg.root !== this.opts.rootPackage.root) {
      return false;
    }

    return this.opts.rootPackage.allowAppImports.some((pattern) =>
      minimatch(relative(join(pkg.root, 'app'), requestingFile), pattern)
    );
  }

  async build(): Promise<void> {
    let bundleDeps = await this.opts.splitter.deps();

    for (let [bundle, deps] of bundleDeps.entries()) {
      this.writeEntryFile(bundle, deps);
    }
    if (!this.opts.strictLoaderKey) {
      this.writeLoaderFile();
    }
    this.linkDeps(bundleDeps);
    let stats = await this.runWebpack();
    this.lastBuildResult = this.summarizeStats(stats, bundleDeps);
    this.addDiscoveredExternals(this.lastBuildResult);
  }

  private addDiscoveredExternals(build: BuildResult) {
    for (let assetFiles of build.entrypoints.values()) {
      for (let assetFile of assetFiles) {
        let inputSrc = readFileSync(
          resolve(this.outputPath, assetFile),
          'utf8'
        );
        let outputSrc = inputSrc.replace(
          /EAI_DISCOVERED_EXTERNALS\(['"]([^'"]+)['"]\)/g,
          (_substr: string, matched: string) => {
            let deps = build
              .externalDepsFor(idToModule(matched))
              .filter((dep) => this.externalizedByUs.has(dep));
            return '[' + deps.map((d) => `'${d}'`).join(',') + ']';
          }
        );
        writeFileSync(resolve(this.outputPath, assetFile), outputSrc, 'utf8');
      }
    }
  }

  private externalDepsSearcher(
    stats: Required<Stats>
  ): (request: string) => string[] {
    let externals = new Map<Module, Set<string>>();

    function gatherExternals(
      module: Module,
      output = new Set<string>()
    ): Set<string> {
      if (externals.has(module)) {
        for (let ext of externals.get(module)!) {
          output.add(ext);
        }
      } else {
        let ownExternals = new Set<string>();
        externals.set(module, ownExternals);
        for (let dep of module.dependencies) {
          let nextModule = stats.compilation.moduleGraph.getModule(dep);
          if (nextModule) {
            if ((nextModule as any).externalType) {
              ownExternals.add((nextModule as any).request);
            } else {
              gatherExternals(nextModule, ownExternals);
            }
          }
        }
        for (let o of ownExternals) {
          output.add(o);
        }
      }
      return output;
    }

    return (request: string): string[] => {
      for (let module of stats.compilation.modules) {
        for (let dep of module.dependencies) {
          if ((dep as any).request === request) {
            return [
              ...gatherExternals(stats.compilation.moduleGraph.getModule(dep)!),
            ];
          }
        }
      }
      return [];
    };
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
      externalDepsFor: this.externalDepsSearcher(_stats),
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
    if (this.opts.strictLoaderKey) {
      writeFileSync(
        join(this.stagingDir, `${name}.mjs`),
        strictEntryTemplate({
          staticImports: deps.staticImports,
          strictLoaderKey: this.opts.strictLoaderKey,
        })
      );
    } else {
      writeFileSync(
        join(this.stagingDir, `${name}.cjs`),
        entryTemplate({
          staticImports: deps.staticImports,
          dynamicImports: deps.dynamicImports,
          dynamicTemplateImports:
            deps.dynamicTemplateImports.map(mapTemplateImports),
          staticTemplateImports:
            deps.staticTemplateImports.map(mapTemplateImports),
          publicAssetURL: this.opts.rootPackage.publicAssetURL(),
        })
      );
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
