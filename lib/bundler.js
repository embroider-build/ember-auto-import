const Plugin = require('broccoli-plugin');
const debug = require('debug')('ember-auto-import:bundler:');
const path = require('path');
const rollup = require('rollup');
const rollupResolve = require('rollup-plugin-node-resolve');
const commonjs = require('rollup-plugin-commonjs');


module.exports = class Bundler extends Plugin {
  constructor(inputTree, options) {
    super([inputTree], options);
    this._analyzer = options.analyzer;
    this._depFinder = options.depFinder;
    this._config = options.config || {};
  }

  _shouldInclude(moduleName) {
    let config = this._config[moduleName];
    if (config && typeof config.include === 'boolean' && !config.include) {
      return false;
    }
    return this._depFinder.hasDependency(moduleName) && !this._depFinder.isEmberAddon(moduleName)
  }

  build() {
    let dependencyTargets = this._analyzer.targets.filter(
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

};
