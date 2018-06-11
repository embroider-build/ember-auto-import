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

    Object.keys(imports).forEach(sourcePath => {

      if (sourcePath[0] === '.' || sourcePath[0] === '/') {
        // we're only trying to identify imports of external NPM
        // packages, so relative imports are never relevant.
        return;
      }

      let parts = sourcePath.split('/');
      let packageName, innerPath;
      if (sourcePath[0] === '@') {
        packageName = `${parts[0]}/${parts[1]}`;
        innerPath = parts.slice(2).join('/');
      } else {
        packageName = parts[0];
        innerPath = parts.slice(1).join('/');
      }

      let config = this._config[packageName];
      if (config && typeof config.include === 'boolean' && !config.include) {
        return;
      }
      if (!this._depFinder.hasDependency(packageName) || this._depFinder.isEmberAddon(packageName)) {
        return;
      }
      this._depFinder.assertAllowed(packageName);

      let bundleName = this._chooseBundle(imports[sourcePath]);

      deps[bundleName][sourcePath] = {
        entrypoint: this._depFinder.entryPoint(packageName, innerPath)
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
