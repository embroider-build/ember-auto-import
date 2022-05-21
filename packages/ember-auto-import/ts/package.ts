import resolvePackagePath from 'resolve-package-path';
import { join, dirname } from 'path';
import { readFileSync } from 'fs';
import { Memoize } from 'typescript-memoize';
import type { Configuration } from 'webpack';
import {
  AddonInstance,
  isDeepAddonInstance,
  Project,
  packageName as getPackageName,
} from '@embroider/shared-internals';
import semver from 'semver';
import type { TransformOptions } from '@babel/core';
import { MacrosConfig } from '@embroider/macros/src/node';

// from child addon instance to their parent package
const parentCache: WeakMap<AddonInstance, Package> = new WeakMap();

// from an addon instance or project to its package
const packageCache: WeakMap<AddonInstance | Project, Package> = new WeakMap();

let pkgGeneration = 0;

export function reloadDevPackages() {
  pkgGeneration++;
}

export interface Options {
  exclude?: string[];
  alias?: { [fromName: string]: string };
  webpack?: Configuration;
  publicAssetURL?: string;
  styleLoaderOptions?: Record<string, unknown>;
  cssLoaderOptions?: Record<string, unknown>;
  miniCssExtractPluginOptions?: Record<string, unknown>;
  forbidEval?: boolean;
  skipBabel?: { package: string; semverRange?: string }[];
  watchDependencies?: (string | string[])[];
  insertScriptsAt?: string;
  insertStylesAt?: string;
}

export interface DepResolution {
  type: 'package';
  path: string;
  packageName: string;
  packageRoot: string;
}

interface LocalResolution {
  type: 'local';
  local: string;
}

interface URLResolution {
  type: 'url';
  url: string;
}

interface ImpreciseResolution {
  type: 'imprecise';
}

type Resolution =
  | DepResolution
  | LocalResolution
  | URLResolution
  | ImpreciseResolution;

export default class Package {
  public name: string;
  public root: string;
  private pkgRoot: string;
  public isAddon: boolean;
  private _options: any;
  private _parent: Project | AddonInstance;
  private _hasBabelDetails = false;
  private _babelMajorVersion?: number;
  private _babelOptions: any;
  private _emberCLIBabelExtensions?: string[];
  private autoImportOptions: Options | undefined;
  private isDeveloping: boolean;
  private pkgGeneration: number;
  private pkgCache: any;
  private macrosConfig: MacrosConfig | undefined;

  static lookupParentOf(child: AddonInstance): Package {
    if (!parentCache.has(child)) {
      let pkg = packageCache.get(child.parent);
      if (!pkg) {
        pkg = new this(child);
        packageCache.set(child.parent, pkg);
      }
      parentCache.set(child, pkg);
    }
    return parentCache.get(child)!;
  }

  constructor(child: AddonInstance) {
    this.name = child.parent.pkg.name;

    if (isDeepAddonInstance(child)) {
      this.root = this.pkgRoot = child.parent.root;
      this.isAddon = true;
      this.isDeveloping = this.root === child.project.root;
      // This is the per-package options from ember-cli
      this._options = child.parent.options;
    } else {
      // this can differ from child.parent.root because Dummy apps are terrible
      this.root = join(child.project.configPath(), '..', '..');
      this.pkgRoot = child.parent.root;
      this.isAddon = false;
      this.isDeveloping = true;
      this._options = child.app.options;
      this.macrosConfig = MacrosConfig.for(child.app, this.root);
    }

    this._parent = child.parent;

    // Stash our own config options
    this.autoImportOptions = this._options.autoImport;

    this.pkgCache = child.parent.pkg;
    this.pkgGeneration = pkgGeneration;
  }

  _ensureBabelDetails() {
    if (this._hasBabelDetails) {
      return;
    }
    let { babelOptions, extensions, version } = this.buildBabelOptions(
      this._parent,
      this._options
    );
    this._emberCLIBabelExtensions = extensions;
    this._babelOptions = babelOptions;
    this._babelMajorVersion = version;
    this._hasBabelDetails = true;
  }

  get babelOptions(): TransformOptions {
    this._ensureBabelDetails();
    return this._babelOptions;
  }

  get babelMajorVersion() {
    this._ensureBabelDetails();
    return this._babelMajorVersion;
  }

  @Memoize()
  get isFastBootEnabled() {
    return (
      process.env.FASTBOOT_DISABLED !== 'true' &&
      this._parent.addons.some((addon) => addon.name === 'ember-cli-fastboot')
    );
  }

  private buildBabelOptions(instance: Project | AddonInstance, options: any) {
    // Generate the same babel options that the package (meaning app or addon)
    // is using. We will use these so we can configure our parser to
    // match.
    let babelAddon = instance.addons.find(
      (addon) => addon.name === 'ember-cli-babel'
    ) as any;
    let version = parseInt(babelAddon.pkg.version.split('.')[0], 10);
    let babelOptions, extensions;

    babelOptions = babelAddon.buildBabelOptions(options);
    extensions = babelOptions.filterExtensions || ['js'];

    // https://github.com/babel/ember-cli-babel/issues/227
    delete babelOptions.annotation;
    delete babelOptions.throwUnlessParallelizable;
    delete babelOptions.filterExtensions;

    if (babelOptions.plugins) {
      babelOptions.plugins = babelOptions.plugins.filter(
        (p: any) => !p._parallelBabel
      );
    }

    return { babelOptions, extensions, version };
  }

  private get pkg() {
    if (
      !this.pkgCache ||
      (this.isDeveloping && pkgGeneration !== this.pkgGeneration)
    ) {
      // avoiding `require` here because we don't want to go through the
      // require cache.
      this.pkgCache = JSON.parse(
        readFileSync(join(this.pkgRoot, 'package.json'), 'utf-8')
      );
      this.pkgGeneration = pkgGeneration;
    }
    return this.pkgCache;
  }

  get namespace(): string {
    // This namespacing ensures we can be used by multiple packages as
    // well as by an addon and its dummy app simultaneously
    return `${this.name}/${this.isAddon ? 'addon' : 'app'}`;
  }

  // extra dependencies that must be treated as if they were really dependencies
  // of this package. sigh.
  //
  // maps from packageName to packageRoot
  magicDeps: Map<string, string> | undefined;

  private hasDependency(name: string): boolean {
    let { pkg } = this;
    return Boolean(
      pkg.dependencies?.[name] ||
        pkg.devDependencies?.[name] ||
        pkg.peerDependencies?.[name] ||
        this.magicDeps?.get(name)
    );
  }

  // the semver range of the given package that our package requests in
  // package.json
  requestedRange(packageName: string): string | undefined {
    let { pkg } = this;
    return (
      pkg.dependencies?.[packageName] ||
      pkg.devDependencies?.[packageName] ||
      pkg.peerDependencies?.[packageName]
    );
  }

  private hasNonDevDependency(name: string): boolean {
    let pkg = this.pkg;
    return Boolean(
      pkg.dependencies?.[name] ||
        pkg.peerDependencies?.[name] ||
        this.magicDeps?.has(name)
    );
  }

  static categorize(importedPath: string, partial = false) {
    if (/^(\w+:)?\/\//.test(importedPath) || importedPath.startsWith('data:')) {
      return 'url';
    }

    if (importedPath[0] === '.' || importedPath[0] === '/') {
      return 'local';
    }

    if (partial && !isPrecise(importedPath)) {
      return 'imprecise';
    }
    return 'dep';
  }

  resolve(
    importedPath: string,
    fromPath: string
  ): DepResolution | LocalResolution | URLResolution | undefined;
  resolve(
    importedPath: string,
    fromPath: string,
    partial: true
  ):
    | DepResolution
    | LocalResolution
    | URLResolution
    | ImpreciseResolution
    | undefined;
  resolve(
    importedPath: string,
    fromPath: string,
    partial = false
  ): Resolution | undefined {
    switch (Package.categorize(importedPath, partial)) {
      case 'url':
        return { type: 'url', url: importedPath };
      case 'local':
        return {
          type: 'local',
          local: importedPath,
        };
      case 'imprecise':
        if (partial) {
          return {
            type: 'imprecise',
          };
        }
        break;
    }

    let path = this.aliasFor(importedPath);
    let packageName = getPackageName(path);
    if (!packageName) {
      // this can only happen if the user supplied an alias that points at a
      // relative or absolute path, rather than a package name. If the
      // originally authored import was an absolute or relative path, it would
      // have hit our { type: 'local' } condition before we ran aliasFor.
      //
      // At the moment, we don't try to handle this case, but we could in the
      // future.
      return {
        type: 'local',
        local: path,
      };
    }

    if (this.excludesDependency(packageName)) {
      // This package has been explicitly excluded.
      return;
    }

    if (!this.hasDependency(packageName)) {
      return;
    }

    let packageRoot: string | undefined;

    let packagePath = resolvePackagePath(packageName, this.root);
    if (packagePath) {
      packageRoot = dirname(packagePath);
    }

    if (!packageRoot) {
      packageRoot = this.magicDeps?.get(packageName);
    }

    if (packageRoot == null) {
      throw new Error(
        `${this.name} tried to import "${packageName}" in "${fromPath}" but the package was not resolvable from ${this.root}`
      );
    }

    if (isV1EmberAddonDependency(packageRoot)) {
      // ember addon are not auto imported
      return;
    }
    this.assertAllowedDependency(packageName, fromPath);
    return {
      type: 'package',
      path,
      packageName,
      packageRoot,
    };
  }

  private assertAllowedDependency(name: string, fromPath: string) {
    if (this.isAddon && !this.hasNonDevDependency(name)) {
      throw new Error(
        `${this.name} tried to import "${name}" in "${fromPath}" from addon code, but "${name}" is a devDependency. You may need to move it into dependencies.`
      );
    }
  }

  private excludesDependency(name: string): boolean {
    return Boolean(
      this.autoImportOptions &&
        this.autoImportOptions.exclude &&
        this.autoImportOptions.exclude.includes(name)
    );
  }

  get webpackConfig(): any {
    return this.autoImportOptions && this.autoImportOptions.webpack;
  }

  get skipBabel(): Options['skipBabel'] {
    return this.autoImportOptions && this.autoImportOptions.skipBabel;
  }

  get aliases(): Record<string, string> | undefined {
    return this.autoImportOptions?.alias;
  }

  // this follows the same rules as webpack's resolve.alias. It's a prefix
  // match, unless the configured pattern ends with "$" in which case that means
  // exact match.
  private aliasFor(name: string): string {
    let alias = this.autoImportOptions?.alias;
    if (!alias) {
      return name;
    }

    let exactMatch = alias[`${name}$`];
    if (exactMatch) {
      return exactMatch;
    }
    let prefixMatch = Object.keys(alias).find((pattern) =>
      name.startsWith(pattern)
    );
    if (prefixMatch && alias[prefixMatch]) {
      return alias[prefixMatch] + name.slice(prefixMatch.length);
    }
    return name;
  }

  get fileExtensions(): string[] {
    this._ensureBabelDetails();

    // type safety: this will have been populated by the call above
    return this._emberCLIBabelExtensions!;
  }

  publicAssetURL(): string {
    if (this.isAddon) {
      throw new Error(`bug: only the app should control publicAssetURL`);
    }
    return ensureTrailingSlash(
      this.autoImportOptions?.publicAssetURL ??
        ensureTrailingSlash((this._parent as any).config().rootURL) + 'assets/'
    );
  }

  get styleLoaderOptions(): Record<string, unknown> | undefined {
    // only apps (not addons) are allowed to set this
    return this.isAddon
      ? undefined
      : this.autoImportOptions?.styleLoaderOptions;
  }

  get cssLoaderOptions(): Record<string, unknown> | undefined {
    // only apps (not addons) are allowed to set this
    return this.isAddon ? undefined : this.autoImportOptions?.cssLoaderOptions;
  }

  get miniCssExtractPluginOptions(): Record<string, unknown> | undefined {
    // only apps (not addons) are allowed to set this
    return this.isAddon
      ? undefined
      : this.autoImportOptions?.miniCssExtractPluginOptions;
  }

  get forbidsEval(): boolean {
    // only apps (not addons) are allowed to set this, because it's motivated by
    // the apps own Content Security Policy.
    return Boolean(
      !this.isAddon &&
        this.autoImportOptions &&
        this.autoImportOptions.forbidEval
    );
  }

  get insertScriptsAt(): string | undefined {
    if (this.isAddon) {
      throw new Error(`bug: only apps should control insertScriptsAt`);
    }
    return this.autoImportOptions?.insertScriptsAt;
  }

  get insertStylesAt(): string | undefined {
    if (this.isAddon) {
      throw new Error(`bug: only apps should control insertStylesAt`);
    }
    return this.autoImportOptions?.insertStylesAt;
  }

  get watchedDirectories(): string[] | undefined {
    // only apps (not addons) are allowed to set this
    if (!this.isAddon && this.autoImportOptions?.watchDependencies) {
      return this.autoImportOptions.watchDependencies
        .map((nameOrNames) => {
          let names: string[];
          if (typeof nameOrNames === 'string') {
            names = [nameOrNames];
          } else {
            names = nameOrNames;
          }
          let cursor = this.root;
          for (let name of names) {
            let path = resolvePackagePath(name, cursor);
            if (!path) {
              return undefined;
            }
            cursor = dirname(path);
          }
          return cursor;
        })
        .filter(Boolean) as string[];
    }
  }

  cleanBabelConfig(): TransformOptions {
    if (this.isAddon) {
      throw new Error(`Only the app can generate auto-import's babel config`);
    }
    // casts here are safe because we just checked isAddon is false
    let parent = this._parent as Project;
    let macrosConfig = this.macrosConfig!;

    let emberSource = parent.addons.find(
      (addon) => addon.name === 'ember-source'
    );
    if (!emberSource) {
      throw new Error(`failed to find ember-source in addons of ${this.name}`);
    }
    let ensureModuleApiPolyfill = semver.satisfies(
      emberSource.pkg.version,
      '<3.27.0',
      { includePrerelease: true }
    );
    let templateCompilerPath: string = (emberSource as any).absolutePaths
      .templateCompiler;

    let plugins = [
      [require.resolve('@babel/plugin-proposal-decorators'), { legacy: true }],
      [
        require.resolve('@babel/plugin-proposal-class-properties'),
        { loose: false },
      ],
      [
        require.resolve('babel-plugin-htmlbars-inline-precompile'),
        {
          ensureModuleApiPolyfill,
          templateCompilerPath,
          modules: {
            'ember-cli-htmlbars': 'hbs',
            '@ember/template-compilation': {
              export: 'precompileTemplate',
              disableTemplateLiteral: true,
              shouldParseScope: true,
              isProduction: process.env.EMBER_ENV === 'production',
            },
          },
        },
      ],
      ...macrosConfig.babelPluginConfig(),
    ];

    if (ensureModuleApiPolyfill) {
      plugins.push([
        require.resolve('babel-plugin-ember-modules-api-polyfill'),
      ]);
    }

    return {
      // do not use the host project's own `babel.config.js` file. Only a strict
      // subset of features are allowed in the third-party code we're
      // transpiling.
      //
      // - every package gets babel preset-env unless skipBabel is configured
      //   for them.
      // - because we process v2 ember packages, we enable inline hbs (with no
      //   custom transforms) and modules-api-polyfill
      configFile: false,
      babelrc: false,

      // leaving this unset can generate an unhelpful warning from babel on
      // large files like 'Note: The code generator has deoptimised the
      // styling of... as it exceeds the max of 500KB."
      generatorOpts: {
        compact: true,
      },

      plugins,
      presets: [
        [
          require.resolve('@babel/preset-env'),
          {
            modules: false,
            targets: parent.targets,
          },
        ],
      ],
    };
  }

  browserslist() {
    if (this.isAddon) {
      throw new Error(`Only the app can determine the browserslist`);
    }
    // cast here is safe because we just checked isAddon is false
    let parent = this._parent as Project;
    return (parent.targets as { browsers: string[] }).browsers.join(',');
  }
}

const isAddonCache = new Map<string, boolean>();
function isV1EmberAddonDependency(packageRoot: string): boolean {
  let cached = isAddonCache.get(packageRoot);
  if (cached === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    let packageJSON = require(join(packageRoot, 'package.json'));
    let answer =
      packageJSON.keywords?.includes('ember-addon') &&
      (packageJSON['ember-addon']?.version ?? 1) < 2;
    isAddonCache.set(packageRoot, answer);
    return answer;
  } else {
    return cached;
  }
}

function count(str: string, letter: string): number {
  return [...str].reduce((a, b) => a + (b === letter ? 1 : 0), 0);
}

function isPrecise(leadingQuasi: string): boolean {
  if (leadingQuasi.startsWith('.') || leadingQuasi.startsWith('/')) {
    return true;
  }
  let slashes = count(leadingQuasi, '/');
  let minSlashes = leadingQuasi.startsWith('@') ? 2 : 1;
  return slashes >= minSlashes;
}

function ensureTrailingSlash(url: string): string {
  if (url[url.length - 1] !== '/') {
    url = url + '/';
  }
  return url;
}
