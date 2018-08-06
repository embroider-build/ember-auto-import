import Plugin, { Tree } from 'broccoli-plugin';
import makeDebug from 'debug';
import WebpackBundler from './webpack';
import Splitter, { BundleDependencies } from './splitter';
import Package, { reloadDevPackages } from './package';
import { merge } from 'lodash';
import { bundles, bundleEntrypoint } from './bundle-config';
import { join, dirname } from 'path';
import { readFileSync, writeFileSync, ensureDirSync } from 'fs-extra';

const debug = makeDebug('ember-auto-import:bundler');

export interface BundlerPluginOptions {
  consoleWrite: (string) => void;
  environment: string;
  splitter: Splitter;
  packages: Set<Package>;
}

export interface BuildResult {
  entrypoints: Map<string, string[]>;
  lazyAssets: string[];
}

export interface BundlerHook {
  build(modules: Map<string, BundleDependencies>): Promise<BuildResult>;
}

export default class Bundler extends Plugin {
  private lastDeps = null;
  private cachedBundlerHook;

  constructor(allAppTree: Tree, private options : BundlerPluginOptions) {
    super([allAppTree], { persistentOutput: true });
  }

  private get publicAssetURL() : string|undefined {
    // Only the app (not an addon) can customize the public asset URL, because
    // it's an app concern.
    let rootPackage = [...this.options.packages.values()].find(pkg => !pkg.isAddon);
    if (rootPackage) {
      let url = rootPackage.publicAssetURL;
      if (url) {
        if (url[url.length-1] !== '/') {
          url = url + '/';
        }
        return url;
      }
    }
  }

  get bundlerHook() : BundlerHook {
    if (!this.cachedBundlerHook){
      let extraWebpackConfig = merge({}, ...[...this.options.packages.values()].map(pkg => pkg.webpackConfig));
      debug('extraWebpackConfig %j', extraWebpackConfig);
      this.cachedBundlerHook = new WebpackBundler(
        bundles,
        join(this.outputPath, 'assets'),
        this.options.environment,
        extraWebpackConfig,
        this.options.consoleWrite,
        this.publicAssetURL
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
      this.updateEntrypoints(buildResult.entrypoints);
      this.addFastbootImports(buildResult.lazyAssets);
      this.lastDeps = bundleDeps;
    }
  }

  private updateEntrypoints(entrypoints) {
    for (let bundle of bundles) {
      if (entrypoints.has(bundle)) {
        let target = bundleEntrypoint(bundle);
        let sources = entrypoints.get(bundle).map(asset => readFileSync(join(this.outputPath, 'assets', asset), 'utf8'));
        sources.unshift(readFileSync(join(this.inputPaths[0], target), 'utf8'));
        ensureDirSync(dirname(join(this.outputPath, target)));
        writeFileSync(join(this.outputPath, target), sources.join("\n"), 'utf8');
      }
    }
  }

  private addFastbootImports(lazyAssets) {
    let contents = lazyAssets.map(asset => readFileSync(join(this.outputPath, 'assets', asset), 'utf8'));
    writeFileSync(join(this.outputPath, 'assets', 'auto-import-fastboot.js'), contents.join("\n"));
  }
}
