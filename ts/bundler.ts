import Plugin, { Tree } from 'broccoli-plugin';
import makeDebug from 'debug';
import { UnwatchedDir } from 'broccoli-source';
import quickTemp from 'quick-temp';
import WebpackBundler from './webpack';
import { join } from 'path';
import Splitter from './splitter';
import { shallowEqual } from './util';
import Package from './package';
import { merge } from 'lodash';

const debug = makeDebug('ember-auto-import:bundler');

export interface BundlerPluginOptions {
  bundle: string;
  consoleWrite: (string) => void;
  environment: string;
  splitter: Splitter;
  outputFile: string;
  packages: Set<Package>;
}

export class BundlerPlugin extends Plugin {
  private lastDeps = null;
  private cachedBundlerHook;

  constructor(placeholderTree, private options : BundlerPluginOptions) {
    // we need to have at least one valid input tree during
    // construction, and our real trees aren't available yet, so we
    // use a placeholder that doesn't really do anything.
    super([placeholderTree], { persistentOutput: true });
  }

  get bundlerHook(){
    if (!this.cachedBundlerHook){
      let extraWebpackConfig = merge({}, ...[...this.options.packages.values()].map(pkg => pkg.webpackConfig));
      debug('extraWebpackConfig %j', extraWebpackConfig);
      this.cachedBundlerHook = new WebpackBundler(
        join(this.outputPath, this.options.outputFile),
        this.options.environment,
        extraWebpackConfig,
        this.options.consoleWrite
      );
    }
    return this.cachedBundlerHook;
  }

  async build() {
    let { splitter, bundle} = this.options;
    let dependencies = await splitter.depsForBundle(bundle);
    let moduleNames = Object.keys(dependencies);

    if (shallowEqual(moduleNames, this.lastDeps)) {
      return;
    }

    debug("building %s bundle with dependencies: %j", bundle, moduleNames);
    await this.bundlerHook.build(dependencies);
    this.lastDeps = moduleNames;
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
