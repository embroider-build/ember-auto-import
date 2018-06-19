import Plugin, { Tree } from 'broccoli-plugin';
import makeDebug from 'debug';
import { UnwatchedDir } from 'broccoli-source';
import quickTemp from 'quick-temp';
import concat from 'broccoli-concat';
import { buildDebugCallback }  from 'broccoli-debug';
import webpackBundler from './webpack';
import { join } from 'path';
import rimraf from 'rimraf';
import Splitter from './splitter';
import { BundlerHook } from './bundler-hook';

const debug = makeDebug('ember-auto-import:bundler');
const debugTree = buildDebugCallback('ember-auto-import');

export interface BundlerPluginOptions {
  bundle: string;
  consoleWrite: (string) => void;
  environment: string;
  splitter: Splitter;
  config;
}

export class BundlerPlugin extends Plugin {
  private builtModules = new Map();

  constructor(placeholderTree, private options : BundlerPluginOptions) {
    // we need to have at least one valid input tree during
    // construction, and our real trees aren't available yet, so we
    // use a placeholder that doesn't really do anything.
    super([placeholderTree], { persistentOutput: true });
  }

  async build() {
    let { splitter, bundle} = this.options;
    let dependencies = await splitter.depsForBundle(bundle);
    if (!dependencies) {
      return;
    }

    let moduleNames = Object.keys(dependencies);
    debug("dependencies for %s bundle: %s", bundle, moduleNames);

    [...this.builtModules.keys()].forEach(cachedModule => {
      if (!dependencies[cachedModule]) {
        debug("removing %s", cachedModule);
        rimraf.sync(join(this.outputPath, cachedModule));
        this.builtModules.delete(cachedModule);
      }
    });

    return Promise.all(moduleNames.map(moduleName => {
      let moduleConfig = this.options.config.modules[moduleName] || {};
      if (this.builtModules.get(moduleName) && moduleConfig.cache !== false) {
        return;
      }
      debug("adding %s", moduleName);

      let bundlerHook : BundlerHook = moduleConfig.bundler || webpackBundler;
      return bundlerHook({
        moduleName,
        entrypoint: dependencies[moduleName].entrypoint,
        outputFile: join(this.outputPath, moduleName, 'output.js'),
        environment: this.options.environment,
        consoleWrite: this.options.consoleWrite
      }, moduleConfig).then(() => {
        this.builtModules.set(moduleName, true);
      });
    }));
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
