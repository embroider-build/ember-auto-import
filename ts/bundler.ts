import Plugin from 'broccoli-plugin';
import makeDebug from 'debug';
import { UnwatchedDir } from 'broccoli-source';
import quickTemp from 'quick-temp';
import concat from 'broccoli-concat';
import { buildDebugCallback }  from 'broccoli-debug';
import webpackBundler from './webpack';
import { join } from 'path';
import rimraf from 'rimraf';

const debug = makeDebug('ember-auto-import:bundler');
const debugTree = buildDebugCallback('ember-auto-import');

class BundlerPlugin extends Plugin {
  private _bundleName;
  private _splitter;
  private _consoleWrite;
  private _config;
  private _environment;
  private _builtModules;

  constructor(placeholderTree, options) {
    // we need to have at least one valid input tree during
    // construction, and our real trees aren't available yet, so we
    // use a placeholder that doesn't really do anything.
    super([placeholderTree], { persistentOutput: true });
    this._bundleName = options.bundle;
    this._splitter = options.splitter;
    this._consoleWrite = options.consoleWrite;
    this._config = options.config;
    this._environment = options.environment;
    this._builtModules = new Map();
  }

  async build() {
    let dependencies = await this._splitter.depsForBundle(this._bundleName);
    if (!dependencies) {
      return;
    }

    let moduleNames = Object.keys(dependencies);
    debug("dependencies for %s bundle: %s", this._bundleName, moduleNames);

    [...this._builtModules.keys()].forEach(cachedModule => {
      if (!dependencies[cachedModule]) {
        debug("removing %s", cachedModule);
        rimraf.sync(join(this.outputPath, cachedModule));
        this._builtModules.delete(cachedModule);
      }
    });

    return Promise.all(moduleNames.map(moduleName => {
      let moduleConfig = this._config.modules[moduleName] || {};
      if (this._builtModules.get(moduleName) && moduleConfig.cache !== false) {
        return;
      }
      debug("adding %s", moduleName);

      let bundlerHook = moduleConfig.bundler || webpackBundler;
      return bundlerHook({
        moduleName,
        entrypoint: dependencies[moduleName].entrypoint,
        outputFile: join(this.outputPath, moduleName, 'output.js'),
        environment: this._environment,
        consoleWrite: this._consoleWrite
      }, moduleConfig).then(() => {
        this._builtModules.set(moduleName, true);
      });
    }));
  }
}

export default class Bundler {
  private _placeholder;
  private _placeholderTree;
  plugin;
  tree;

  constructor(options) {
    quickTemp.makeOrRemake(this, '_placeholder', 'ember-auto-import');
    this._placeholderTree = new UnwatchedDir(this._placeholder, { annotation: 'ember-auto-import' });
    this.plugin = new BundlerPlugin(this._placeholderTree, options);

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
}
