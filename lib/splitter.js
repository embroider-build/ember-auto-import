
module.exports = class Splitter {
  constructor(options) {
    // list of bundle names in priority order
    this._bundles = options.bundles;

    this._depFinder = options.depFinder;
    this._config = options.config || {};
    this._analyzer = options.analyzer;
    this._lastImports = null;
    this._lastDeps = null;
  }

  depsForBundle(bundleName) {
    let imports = this._analyzer.imports;
    if (!this._lastDeps || this._lastImports !== imports) {
      this._lastDeps = this._computeDeps(imports);
    }
    return this._lastDeps[bundleName];
  }

  _computeDeps(imports) {
    let deps = {
      app: {}
    };
    Object.keys(imports).filter(moduleName => {
      let config = this._config[moduleName];
      if (config && typeof config.include === 'boolean' && !config.include) {
        return false;
      }
      return this._depFinder.hasDependency(moduleName) && !this._depFinder.isEmberAddon(moduleName)
    }).forEach(moduleName => {
      this._depFinder.assertAllowed(moduleName);
      deps.app[moduleName] = {
        entrypoint: this._depFinder.entryPoint(moduleName)
      };
    });
    return deps;
  }

}
