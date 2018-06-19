import webpack from 'webpack';
import { dirname, basename } from 'path';
import { merge } from 'lodash';
import { BundlerHookInputs } from './bundler-hook';

export default function({ moduleName, entrypoint, outputFile, consoleWrite, environment } : BundlerHookInputs, moduleConfig) : Promise<void> {
  return new Promise((resolve, reject) => {
    let config = {
      mode: environment === 'production' ? 'production' : 'development',
      entry: entrypoint,
      output: {
        path: dirname(outputFile),
        filename: basename(outputFile),
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
    });
  });
}
