const webpack = require('webpack');
const path = require('path');
const { merge } = require('lodash');

module.exports = function({ moduleName, entrypoint, outputFile, consoleWrite, environment }, moduleConfig) {
  return new Promise((resolve, reject) => {
    let config = {
      mode: environment === 'production' ? 'production' : 'development',
      entry: entrypoint,
      output: {
        path: path.dirname(outputFile),
        filename: path.basename(outputFile),
        libraryTarget: 'amd',
        library: moduleName
      }
    };
    if (moduleConfig.webpackConfig) {
      merge(config, moduleConfig.webpackConfig);
    }
    webpack(config, (err, stats) => {
      if (err) {
        consoleWrite(stats.toString());
        reject(err);
        return;
      }
      if (stats.hasErrors()) {
        consoleWrite(stats.toString());
        reject(new Error('webpack returned errors to ember-auto-import'));
        return;
      }
      if (stats.hasWarnings()) {
        consoleWrite(stats.toString());
      }
      resolve();
    })
  });
}
