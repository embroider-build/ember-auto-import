const debug = require('debug')('ember-auto-import:splitter');

module.exports = class Splitter {
  constructor(options) {
    // list of bundle names in priority order
    this._bundles = options.bundles;

    this._depFinder = options.depFinder;
    this._config = (options.config && options.config.modules) || {};
    this._analyzer = options.analyzer;
    this._lastImports = null;
    this._lastDeps = null;
    this._usersBundleForPath = options.bundleForPath;
  }

  depsForBundle(bundleName) {
    let imports = this._analyzer.imports;
    if (!this._lastDeps || this._lastImports !== imports) {
      this._lastDeps = this._computeDeps(imports);
      debug('splitter %j', this._lastDeps);
    }
    return this._lastDeps[bundleName];
  }

  _computeDeps(imports) {
    let deps = {};

    this._bundles.forEach(bundleName => {
      deps[bundleName] = {};
    });

    Object.keys(imports).forEach(moduleName => {
      let config = this._config[moduleName];
      if (config && typeof config.include === 'boolean' && !config.include) {
        return;
      }
      if (!this._depFinder.hasDependency(moduleName) || this._depFinder.isEmberAddon(moduleName)) {
        return;
      }
      this._depFinder.assertAllowed(moduleName);

      let bundleName = this._chooseBundle(imports[moduleName]);

      deps[bundleName][moduleName] = {
        entrypoint: this._depFinder.entryPoint(moduleName)
      };
    });

    return deps;
  }

  // given that a module is imported by the given list of paths, which
  // bundle should it go in?
  _chooseBundle(paths) {
    let usedInBundles = {};
    paths.forEach(path => {
      usedInBundles[this._bundleForPath(path)] = true;
    });
    return this._bundles.find(bundle => usedInBundles[bundle]);
  }

  _bundleForPath(path) {
    let bundleName = this._usersBundleForPath(path);
    if (this._bundles.indexOf(bundleName) === -1) {
      throw new Error(`bundleForPath("${path}") returned ${bundleName}" but the only configured bundle names are ${this._bundles.join(',')}`);
    }
    debug('bundleForPath("%s")=%s', path, bundleName);
    return bundleName;
  }
}
