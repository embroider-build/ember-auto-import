import makeDebug from 'debug';
import DepFinder from './dep-finder';
import Analyzer from './analyzer';

const debug = makeDebug('ember-auto-import:splitter');

export interface SplitterOptions {
  // list of bundle names in priority order
  bundles: string[];
  depFinder: DepFinder;
  config;
  analyzer: Analyzer;
  bundleForPath: (string) => string;
}

export default class Splitter {
  private config;
  private lastImports = null;
  private lastDeps = null;

  constructor(private options : SplitterOptions) {
    this.config = (options.config && options.config.modules) || {};
  }

  async depsForBundle(bundleName) {
    let imports = this.options.analyzer.imports;
    if (!this.lastDeps || this.lastImports !== imports) {
      this.lastDeps = await this.computeDeps(imports);
      debug('splitter %j', this.lastDeps);
    }
    return this.lastDeps[bundleName];
  }

  private async computeDeps(imports) {
    let deps = {};

    this.options.bundles.forEach(bundleName => {
      deps[bundleName] = {};
    });

    await Promise.all(Object.keys(imports).map(async sourcePath => {

      if (sourcePath[0] === '.' || sourcePath[0] === '/') {
        // we're only trying to identify imports of external NPM
        // packages, so relative imports are never relevant.
        return;
      }

      let parts = sourcePath.split('/');
      let packageName;
      if (sourcePath[0] === '@') {
        packageName = `${parts[0]}/${parts[1]}`;
      } else {
        packageName = parts[0];
      }

      let config = this.config[packageName];
      if (config && typeof config.include === 'boolean' && !config.include) {
        return;
      }
      let { depFinder } = this.options;
      if (!depFinder.hasDependency(packageName) || depFinder.isEmberAddon(packageName)) {
        return;
      }
      depFinder.assertAllowed(packageName);

      let bundleName = this.chooseBundle(imports[sourcePath]);

      deps[bundleName][sourcePath] = {
        entrypoint: await depFinder.entryPoint(sourcePath)
      };
    }));

    return deps;
  }

  // given that a module is imported by the given list of paths, which
  // bundle should it go in?
  private chooseBundle(paths) {
    let usedInBundles = {};
    paths.forEach(path => {
      usedInBundles[this.bundleForPath(path)] = true;
    });
    return this.options.bundles.find(bundle => usedInBundles[bundle]);
  }

  private bundleForPath(path) {
    let bundleName = this.options.bundleForPath(path);
    if (this.options.bundles.indexOf(bundleName) === -1) {
      throw new Error(`bundleForPath("${path}") returned ${bundleName}" but the only configured bundle names are ${this.options.bundles.join(',')}`);
    }
    debug('bundleForPath("%s")=%s', path, bundleName);
    return bundleName;
  }
}
