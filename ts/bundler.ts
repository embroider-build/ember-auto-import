import Plugin, { Tree } from 'broccoli-plugin';
import makeDebug from 'debug';
import { UnwatchedDir } from 'broccoli-source';
import quickTemp from 'quick-temp';
import WebpackBundler from './webpack';
import Splitter, { BundleDependencies } from './splitter';
import Package from './package';
import { merge } from 'lodash';
import { bundles } from './bundle-config';

const debug = makeDebug('ember-auto-import:bundler');

export interface BundlerPluginOptions {
  consoleWrite: (string) => void;
  environment: string;
  splitter: Splitter;
  packages: Set<Package>;
}

export interface BundlerHook {
  build(modules: Map<string, BundleDependencies>): Promise<void>;
}

class BundlerPlugin extends Plugin {
  private lastDeps = null;
  private cachedBundlerHook;

  constructor(placeholderTree, private options : BundlerPluginOptions) {
    // we need to have at least one valid input tree during
    // construction, and our real trees aren't available yet, so we
    // use a placeholder that doesn't really do anything.
    super([placeholderTree], { persistentOutput: true });
  }

  get bundlerHook() : BundlerHook {
    if (!this.cachedBundlerHook){
      let extraWebpackConfig = merge({}, ...[...this.options.packages.values()].map(pkg => pkg.webpackConfig));
      debug('extraWebpackConfig %j', extraWebpackConfig);
      this.cachedBundlerHook = new WebpackBundler(
        bundles,
        this.outputPath,
        this.options.environment,
        extraWebpackConfig,
        this.options.consoleWrite
      );
    }
    return this.cachedBundlerHook;
  }

  async build() {
    let { splitter } = this.options;
    let bundleDeps = await splitter.deps();
    if (bundleDeps !== this.lastDeps) {
      await this.bundlerHook.build(bundleDeps);
      this.lastDeps = bundleDeps;
    }
  }
}

export default class Bundler {
  private placeholder: string;
  private placeholderTree : Tree;
  tree: Tree;

  constructor(options: BundlerPluginOptions) {
    quickTemp.makeOrRemake(this, 'placeholder', 'ember-auto-import');
    this.placeholderTree = new UnwatchedDir(this.placeholder, { annotation: 'ember-auto-import' });
    this.tree = new BundlerPlugin(this.placeholderTree, options);
  }

  unsafeConnect(tree: Tree){
    let plugin = this.tree as any;
    plugin._inputNodes.push(tree);
  }
}
