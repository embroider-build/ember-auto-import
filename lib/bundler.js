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
const { flatMap } = require('lodash');

class BundlerPlugin extends Plugin {
  constructor(bundler, options) {
    // we need to have at least one valid input tree during
    // construction, and our real trees aren't available yet, so we
    // use a placeholder that doesn't really do anything.
    super([bundler._placeholderTree], options);
    this._bundler = bundler;
    this._depFinder = options.depFinder;
    this._config = options.config || {};
    this.build.flag = true;
  }

  _shouldInclude(moduleName) {
    let config = this._config[moduleName];
    if (config && typeof config.include === 'boolean' && !config.include) {
      return false;
    }
    return this._depFinder.hasDependency(moduleName) && !this._depFinder.isEmberAddon(moduleName)
  }

  build() {
    let analyzers = this._inputNodes.slice(1);
    if (!analyzers.length === 0) {
      throw new Error("bug in ember-auto-import: failed to connect to analyzers");
    }
    debug('building against %s analyzers', analyzers.length);
    let dependencyTargets = flatMap(analyzers, a => a.targets).filter(
      t => this._shouldInclude(t)
    );
    debug("dependency targets %s", dependencyTargets);

    return Promise.all(dependencyTargets.map(target => {

      let inputOptions = {
        input: this._depFinder.entryPoint(target),
        plugins: [
          rollupResolve({
            browser: true
          }),
          commonjs()
        ],
      };

      let outputOptions = {
        file: path.join(this.outputPath, target, 'output.js'),
        format: 'amd',
        amd: { id: target },
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
    this._pluginTree = new BundlerPlugin(this, options);

    // The bundler plugin generates one file per imported module, here
    // we combine them into a single file so we can share a single
    // constant app.import.
    this.tree = concat(debugTree(this._pluginTree, 'bundler'), {
      outputFile: options.outputFile,
      inputFiles: ['**/*'],
      sourceMapConfig: { enabled: true },
      allowNone: true
    });

    this._analyzers = [];
  }
  connectAnalyzer(analyzer) {
    debug('heard connectAnalyzer');
    this._analyzers.push(analyzer);

    // Here be dragons
    this._pluginTree._inputNodes.push(analyzer);
  }

}
