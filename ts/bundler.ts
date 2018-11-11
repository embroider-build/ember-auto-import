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
  ensureDirSync,
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
  assets: string[];
}

export interface BundlerHook {
  build(modules: Map<string, BundleDependencies>): Promise<BuildResult>;
}

export default class Bundler extends Plugin {
  private lastDeps = null;
  private cachedBundlerHook;
  buildResult: BuildResult | undefined;

  constructor(allAppTree: Tree, private options: BundlerPluginOptions) {
    super([allAppTree], {
      persistentOutput: true,
      needsCache: true
    });
  }

  private get publicAssetURL(): string | undefined {
    // Only the app (not an addon) can customize the public asset URL, because
    // it's an app concern.
    let rootPackage = [...this.options.packages.values()].find(
      pkg => !pkg.isAddon
    );
    if (rootPackage) {
      let url = rootPackage.publicAssetURL;
      if (url) {
        if (url[url.length - 1] !== '/') {
          url = url + '/';
        }
        return url;
      }
    }
  }

  get bundlerHook(): BundlerHook {
    if (!this.cachedBundlerHook) {
      let extraWebpackConfig = merge(
        {},
        ...[...this.options.packages.values()].map(pkg => pkg.webpackConfig)
      );
      if ([...this.options.packages.values()].find(pkg => pkg.forbidsEval)) {
        extraWebpackConfig.devtool = 'source-map';
      }
      debug('extraWebpackConfig %j', extraWebpackConfig);

      let assetPath = join(this.outputPath, 'assets');
      ensureDirSync(assetPath);

      this.cachedBundlerHook = new WebpackBundler(
        this.options.bundles,
        this.options.environment,
        extraWebpackConfig,
        this.options.consoleWrite,
        this.publicAssetURL,
        this.cachePath,
        assetPath
      );
    }
    return this.cachedBundlerHook;
  }

  async build() {
    reloadDevPackages();
    let { splitter } = this.options;
    let bundleDeps = await splitter.deps();
    if (bundleDeps !== this.lastDeps) {
      let buildResult = await this.bundlerHook.build(bundleDeps);
      this.addFastbootBundle(buildResult);
      this.lastDeps = bundleDeps;
      this.buildResult = buildResult;
    }
  }

  private addFastbootBundle({ assets }) {
    let contents = assets.map(asset => {
      // for JS assets, we save a copy to put into the fastboot combined bundle.
      // We don't want to include other things like WASM here that can't be
      // concatenated.
      if (/\.js$/i.test(asset)) {
        return readFileSync(join(this.outputPath, 'assets', asset));
      }
    }).filter(Boolean);
    writeFileSync(
      join(this.outputPath, 'assets', 'auto-import-fastboot.js'),
      contents.join('\n')
    );
  }
}
