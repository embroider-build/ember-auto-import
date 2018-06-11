const Plugin = require('broccoli-plugin');
const debug = require('debug')('ember-auto-import:bundler:');
const path = require('path');
const rollup = require('rollup');
const rollupResolve = require('rollup-plugin-node-resolve');
const commonjs = require('rollup-plugin-commonjs');
const { UnwatchedDir } = require('broccoli-source');
const quickTemp = require('quick-temp');
const concat = require('broccoli-concat');
const debugTree = require('broccoli-debug').buildDebugCallback('ember-auto-import');

class BundlerPlugin extends Plugin {
  constructor(bundler, options) {
    // we need to have at least one valid input tree during
    // construction, and our real trees aren't available yet, so we
    // use a placeholder that doesn't really do anything.
    super([bundler._placeholderTree], options);
    this._bundler = bundler;
    this._bundleName = options.bundle;
    this._splitter = options.splitter;
  }

  build() {
    let dependencies = this._splitter.depsForBundle(this._bundleName);
    if (!dependencies) {
      return;
    }

    let moduleNames = Object.keys(dependencies);
    debug("dependencies for %s bundle: %s", this._bundleName, moduleNames);

    return Promise.all(moduleNames.map(moduleName => {

      let inputOptions = {
        input: dependencies[moduleName].entrypoint,
        plugins: [
          rollupResolve({
            browser: true
          }),
          commonjs()
        ],
      };

      let outputOptions = {
        file: path.join(this.outputPath, moduleName, 'output.js'),
        format: 'amd',
        amd: { id: moduleName },
        exports: 'named',
      };

      return rollup.rollup(inputOptions).then(bundle => bundle.write(outputOptions));
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
