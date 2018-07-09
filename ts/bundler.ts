import Plugin, { Tree } from 'broccoli-plugin';
import makeDebug from 'debug';
import { UnwatchedDir } from 'broccoli-source';
import quickTemp from 'quick-temp';
import WebpackBundler from './webpack';
import { join, basename, dirname } from 'path';
import Splitter from './splitter';
import { shallowEqual } from './util';
import Package from './package';

const debug = makeDebug('ember-auto-import:bundler');
const transpilePatternCache = new WeakMap();

export interface BundlerPluginOptions {
  bundle: string;
  consoleWrite: (string) => void;
  environment: string;
  splitter: Splitter;
  outputFile: string;
  packages: Set<Package>;
  babelOptions: any;
}

export class BundlerPlugin extends Plugin {
  private lastDeps = null;
  private cachedBundlerHook;
  private currentDependencies;

  constructor(placeholderTree, private options : BundlerPluginOptions) {
    // we need to have at least one valid input tree during
    // construction, and our real trees aren't available yet, so we
    // use a placeholder that doesn't really do anything.
    super([placeholderTree], { persistentOutput: true });
  }

  get bundlerHook(){
    if (!this.cachedBundlerHook){
      let absOutputFile = join(this.outputPath, this.options.outputFile);
      let webpackConfigs = [{
        mode: this.options.environment === 'production' ? 'production' : 'development',
        output: {
          path: dirname(absOutputFile),
          filename: basename(absOutputFile),
          libraryTarget: 'var',
          library: '__ember_auto_import__'
        },
        "module": {
          rules: [
            {
              test: (filename) => this.shouldTranspile(filename),
              use: {
                loader: 'babel-loader',
                options: this.options.babelOptions
              }
            }
          ]
        }
      }].concat([...this.options.packages.values()].map(pkg => pkg.webpackConfig));
      this.cachedBundlerHook = new WebpackBundler(
        webpackConfigs,
        this.options.consoleWrite
      );
    }
    return this.cachedBundlerHook;
  }

  shouldTranspile(filename) {
    return false;
  }

  async build() {
    let { splitter, bundle} = this.options;
    let dependencies = await splitter.depsForBundle(bundle);
    let moduleNames = Object.keys(dependencies);

    if (shallowEqual(moduleNames, this.lastDeps)) {
      return;
    }

    // stash this for use in shouldTranspile
    this.currentDependencies = dependencies;

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
