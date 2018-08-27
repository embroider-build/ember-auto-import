import Plugin, { Tree } from 'broccoli-plugin';
import makeDebug from 'debug';
import WebpackBundler from './webpack';
import Splitter, { BundleDependencies } from './splitter';
import Package, { reloadDevPackages } from './package';
import { merge } from 'lodash';
import { join } from 'path';
import {
  readFileSync,
  writeFileSync,
  emptyDirSync,
  copySync,
} from 'fs-extra';
import BundleConfig from './bundle-config';

const debug = makeDebug('ember-auto-import:bundler');

export interface BundlerPluginOptions {
  consoleWrite: (string) => void;
  environment: string;
  splitter: Splitter;
  packages: Set<Package>;
  bundles: BundleConfig;
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
  private lastDeps = null;
  private cachedBundlerHook;
  private didEnsureDirs = false;
  private rootPackage;

  constructor(allAppTree: Tree, private options: BundlerPluginOptions) {
    super([allAppTree], { persistentOutput: true });
    this.rootPackage = [...options.packages.values()].find(
      pkg => !pkg.isAddon
    );
  }

  private get publicAssetURL(): string | undefined {
    // Only the app (not an addon) can customize the public asset URL, because
    // it's an app concern.
    let url = this.rootPackage.publicAssetURL;
    if (url) {
      if (url[url.length - 1] !== '/') {
        url = url + '/';
      }
      return url;
    }
  }

  private get templateCompiler() {
    return this.rootPackage.templateCompiler;
  }

  get bundlerHook(): BundlerHook {
    if (!this.cachedBundlerHook) {
      let extraWebpackConfig = merge(
        {},
        ...[...this.options.packages.values()].map(pkg => pkg.webpackConfig)
      );
      debug('extraWebpackConfig %j', extraWebpackConfig);
      this.cachedBundlerHook = new WebpackBundler(
        this.options.bundles,
        this.options.environment,
        extraWebpackConfig,
        this.options.consoleWrite,
        this.publicAssetURL,
        this.templateCompiler
      );
    }
    return this.cachedBundlerHook;
  }

  async build() {
    this.ensureDirs();
    reloadDevPackages();
    let { splitter } = this.options;
    let bundleDeps = await splitter.deps();
    if (bundleDeps !== this.lastDeps) {
      let buildResult = await this.bundlerHook.build(bundleDeps);
      this.addEntrypoints(buildResult);
      this.addLazyAssets(buildResult);
      this.lastDeps = bundleDeps;
    }
  }

  private ensureDirs() {
    if (this.didEnsureDirs) {
      return;
    }
    emptyDirSync(join(this.outputPath, 'lazy'));
    for (let bundle of this.options.bundles.names) {
      emptyDirSync(join(this.outputPath, 'entrypoints', bundle));
    }
    this.didEnsureDirs = true;
  }

  private addEntrypoints({ entrypoints, dir }) {
    for (let bundle of this.options.bundles.names) {
      if (entrypoints.has(bundle)) {
        entrypoints
          .get(bundle)
          .forEach(asset => {
            copySync(join(dir, asset), join(this.outputPath, 'entrypoints', bundle, asset));
          });
      }
    }
  }

  private addLazyAssets({ lazyAssets, dir }) {
    let contents = lazyAssets.map(asset => {
      // we copy every lazy asset into place here
      let content = readFileSync(join(dir, asset));
      writeFileSync(join(this.outputPath, 'lazy', asset), content);

      // and then for JS assets, we also save a copy to put into the fastboot
      // combined bundle. We don't want to include other things like WASM here
      // that can't be concatenated.
      if (/\.js$/i.test(asset)) {
        return content;
      }

    }).filter(Boolean);
    writeFileSync(
      join(this.outputPath, 'lazy', 'auto-import-fastboot.js'),
      contents.join('\n')
    );
  }
}
