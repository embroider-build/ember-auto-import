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
  }

  build() {
    let dependencyTargets = this._analyzer.targets.filter(t => this._depFinder.hasDependency(t) && this._depFinder.isPackagePresent(t) && !this._depFinder.isEmberAddon(t));
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
