const Plugin = require('broccoli-plugin');
const debug = require('debug')('ember-auto-import:bundler');
const { UnwatchedDir } = require('broccoli-source');
const quickTemp = require('quick-temp');
const concat = require('broccoli-concat');
const debugTree = require('broccoli-debug').buildDebugCallback('ember-auto-import');
const webpackBundler = require('./webpack');
const path = require('path');
const rimraf = require('rimraf');

class BundlerPlugin extends Plugin {
  constructor(bundler, options) {
    // we need to have at least one valid input tree during
    // construction, and our real trees aren't available yet, so we
    // use a placeholder that doesn't really do anything.
    super([bundler._placeholderTree], { persistentOutput: true });
    this._bundler = bundler;
    this._bundleName = options.bundle;
    this._splitter = options.splitter;
    this._consoleWrite = options.consoleWrite;
    this._config = options.config;
    this._environment = options.environment;
    this._builtModules = new Map();
  }

  build() {
    let dependencies = this._splitter.depsForBundle(this._bundleName);
    if (!dependencies) {
      return;
    }

    let moduleNames = Object.keys(dependencies);
    debug("dependencies for %s bundle: %s", this._bundleName, moduleNames);

    [...this._builtModules.keys()].forEach(cachedModule => {
      if (!dependencies[cachedModule]) {
        debug("removing %s", cachedModule);
        rimraf.sync(path.join(this.outputPath, cachedModule));
        this._builtModules.delete(cachedModule)
      }
    });

    return Promise.all(moduleNames.map(moduleName => {
      if (this._builtModules.get(moduleName)) {
        return;
      }
      debug("adding %s", moduleName);
      let moduleConfig = this._config.modules[moduleName] || {};
      let bundlerHook = moduleConfig.bundler || webpackBundler;
      return bundlerHook({
        moduleName,
        entrypoint: dependencies[moduleName].entrypoint,
        outputFile: path.join(this.outputPath, moduleName, 'output.js'),
        environment: this._environment,
        consoleWrite: this._consoleWrite
      }, moduleConfig).then(() => {
        this._builtModules.set(moduleName, true);
      });
    }));
  }
}

module.exports = class Bundler {
  constructor(options) {
    quickTemp.makeOrRemake(this, '_placeholder', 'ember-auto-import');
    this._placeholderTree = new UnwatchedDir(this._placeholder, { annotation: 'ember-auto-import' });
    this.plugin = new BundlerPlugin(this, options);

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
