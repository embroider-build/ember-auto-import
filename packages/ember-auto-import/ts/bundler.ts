import Plugin from 'broccoli-plugin';
import { Node } from 'broccoli-node-api';
import makeDebug from 'debug';
import WebpackBundler from './webpack';
import Splitter, { BundleDependencies } from './splitter';
import Package, { reloadDevPackages, Options } from './package';
import { mergeWith } from 'lodash';
import { join } from 'path';
import { readFileSync, writeFileSync, emptyDirSync, copySync } from 'fs-extra';
import BundleConfig from './bundle-config';
import { Memoize } from 'typescript-memoize';
import { WatchedDir } from 'broccoli-source';

const debug = makeDebug('ember-auto-import:bundler');

export interface BundlerPluginOptions {
  consoleWrite: (msg: string) => void;
  environment: 'development' | 'test' | 'production';
  splitter: Splitter;
  packages: Set<Package>;
  bundles: BundleConfig;
  targets: unknown;
}

export interface BuildResult {
  entrypoints: Map<string, string[]>;
  lazyAssets: string[];
  dir: string;
}

export interface BundlerHook {
  build(modules: Map<string, BundleDependencies>): Promise<BuildResult>;
}

export default class Bundler extends Plugin {
  private lastDeps: Map<string, BundleDependencies> | undefined;
  private cachedBundlerHook: BundlerHook | undefined;
  private options: BundlerPluginOptions;
  private isWatchingSomeDeps: boolean;

  constructor(allAppTree: Node, options: BundlerPluginOptions) {
    let deps = depsFor(allAppTree, options.packages);
    super(deps, {
      persistentOutput: true,
      needsCache: true,
    });
    this.options = options;
    this.isWatchingSomeDeps = deps.length > 1;
  }

  @Memoize()
  private get rootPackage(): Package {
    let rootPackage = [...this.options.packages.values()].find(pkg => !pkg.isAddon);
    if (!rootPackage) {
      throw new Error(`bug in ember-auto-import, there should always be a Package representing the app`);
    }
    return rootPackage;
  }

  private get publicAssetURL(): string | undefined {
    // Only the app (not an addon) can customize the public asset URL, because
    // it's an app concern.
    return this.rootPackage.publicAssetURL;
  }

  private get skipBabel(): Required<Options>['skipBabel'] {
    let output: Required<Options>['skipBabel'] = [];
    for (let pkg of this.options.packages) {
      let skip = pkg.skipBabel;
      if (skip) {
        output = output.concat(skip);
      }
    }
    return output;
  }

  get bundlerHook(): BundlerHook {
    if (!this.cachedBundlerHook) {
      let extraWebpackConfig = mergeWith(
        {},
        ...[...this.options.packages.values()].map(pkg => pkg.webpackConfig),
        (objValue: any, srcValue: any) => {
          // arrays concat
          if (Array.isArray(objValue)) {
            return objValue.concat(srcValue);
          }
        }
      );
      if ([...this.options.packages.values()].find(pkg => pkg.forbidsEval)) {
        extraWebpackConfig.devtool = 'source-map';
      }
      debug('extraWebpackConfig %j', extraWebpackConfig);
      this.cachedBundlerHook = new WebpackBundler(
        this.options.bundles,
        this.options.environment,
        extraWebpackConfig,
        this.options.consoleWrite,
        this.publicAssetURL,
        this.skipBabel,
        this.options.targets,
        this.cachePath!, // cast is OK because we passed needsCache: true to super constructor
        this.rootPackage.root
      );
    }
    return this.cachedBundlerHook;
  }

  async build() {
    reloadDevPackages();
    let { splitter } = this.options;
    let bundleDeps = await splitter.deps();
    if (bundleDeps !== this.lastDeps || this.isWatchingSomeDeps) {
      let buildResult = await this.bundlerHook.build(bundleDeps);
      this.emptyDirs();
      this.addEntrypoints(buildResult);
      this.addLazyAssets(buildResult);
      this.lastDeps = bundleDeps;
    }
  }

  private emptyDirs() {
    emptyDirSync(join(this.outputPath, 'lazy'));
    for (let bundle of this.options.bundles.names) {
      emptyDirSync(join(this.outputPath, 'entrypoints', bundle));
    }
  }

  private addEntrypoints({ entrypoints, dir }: BuildResult) {
    for (let bundle of this.options.bundles.names) {
      if (entrypoints.has(bundle)) {
        entrypoints.get(bundle)!.forEach(asset => {
          copySync(join(dir, asset), join(this.outputPath, 'entrypoints', bundle, asset));
        });
      }
    }
  }

  private addLazyAssets({ lazyAssets, dir }: BuildResult) {
    let contents = lazyAssets
      .map(asset => {
        // we copy every lazy asset into place here
        let content = readFileSync(join(dir, asset));
        writeFileSync(join(this.outputPath, 'lazy', asset), content);

        // and then for JS assets, we also save a copy to put into the fastboot
        // combined bundle. We don't want to include other things like WASM here
        // that can't be concatenated.
        if (/\.js$/i.test(asset)) {
          return content;
        }
      })
      .filter(Boolean);
    if (this.rootPackage.isFastBootEnabled) {
      writeFileSync(join(this.outputPath, 'lazy', 'auto-import-fastboot.js'), contents.join('\n'));
    }
  }
}

function depsFor(allAppTree: Node, packages: Set<Package>) {
  let deps = [allAppTree];
  for (let pkg of packages) {
    let watched = pkg.watchedDirectories;
    if (watched) {
      deps = deps.concat(watched.map(dir => new WatchedDir(dir)));
    }
  }
  return deps;
}
