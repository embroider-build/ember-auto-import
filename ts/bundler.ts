import Plugin, { Tree } from 'broccoli-plugin';
import makeDebug from 'debug';
import { UnwatchedDir } from 'broccoli-source';
import quickTemp from 'quick-temp';
import concat from 'broccoli-concat';
import { buildDebugCallback }  from 'broccoli-debug';
import WebpackBundler from './webpack';
import { join } from 'path';
import Splitter from './splitter';
import { shallowEqual } from './util';

const debug = makeDebug('ember-auto-import:bundler');
const debugTree = buildDebugCallback('ember-auto-import');

export interface BundlerPluginOptions {
  bundle: string;
  consoleWrite: (string) => void;
  environment: string;
  splitter: Splitter;
  outputFile: string;
  config;
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
      // FIXME
      let extraWebpackConfig = {};

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
  private plugin : BundlerPlugin;
  tree: Tree;

  constructor(options) {
    quickTemp.makeOrRemake(this, 'placeholder', 'ember-auto-import');
    this.placeholderTree = new UnwatchedDir(this.placeholder, { annotation: 'ember-auto-import' });
    this.plugin = new BundlerPlugin(this.placeholderTree, options);

    // The bundler plugin generates one file per imported module, here
    // we combine them into a single file so we can share a single
    // constant app.import.
    this.tree = concat(debugTree(this.plugin, 'bundler'), {
      outputFile: options.outputFile,
      inputFiles: ['**/*'],
      sourceMapConfig: { enabled: true },
      allowNone: true
    });
  }

  unsafeConnect(tree: Tree){
    let plugin = this.plugin as any;
    plugin._inputNodes.push(tree);
  }
}
