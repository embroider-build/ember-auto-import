import Plugin, { Tree } from 'broccoli-plugin';
import makeDebug from 'debug';
import WebpackBundler from './webpack';
import Splitter, { BundleDependencies } from './splitter';
import Package, { reloadDevPackages } from './package';
import { merge } from 'lodash';
import { bundles } from './bundle-config';
import { join } from 'path';
import {
  readFileSync,
  writeFileSync,
  emptyDirSync,
  copySync,
} from 'fs-extra';

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
  dir: string;
}

export interface BundlerHook {
  build(modules: Map<string, BundleDependencies>): Promise<BuildResult>;
}

export default class Bundler extends Plugin {
  private lastDeps = null;
  private cachedBundlerHook;
  private didEnsureDirs = false;

  constructor(allAppTree: Tree, private options: BundlerPluginOptions) {
    super([allAppTree], { persistentOutput: true });
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
      debug('extraWebpackConfig %j', extraWebpackConfig);
      this.cachedBundlerHook = new WebpackBundler(
        bundles,
        this.options.environment,
        extraWebpackConfig,
        this.options.consoleWrite,
        this.publicAssetURL
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
    emptyDirSync(join(this.outputPath, 'assets'));
    for (let bundle of bundles) {
      emptyDirSync(join(this.outputPath, 'entrypoints', bundle));
    }
    this.didEnsureDirs = true;
  }

  private addEntrypoints({ entrypoints, dir }) {
    for (let bundle of bundles) {
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
      let content = readFileSync(join(dir, asset), 'utf8');
      writeFileSync(join(this.outputPath, 'assets', asset), content, 'utf8');
      return content;
    });
    writeFileSync(
      join(this.outputPath, 'assets', 'auto-import-fastboot.js'),
      contents.join('\n')
    );
  }
}
