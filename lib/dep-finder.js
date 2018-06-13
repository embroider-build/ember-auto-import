const resolve = require('resolve');
const { get } = require('lodash');
const path = require('path');

module.exports = class {
  constructor(project, insideAddon) {
    this._project = project;
    this._insideAddon = insideAddon;
    let pkg = project.pkg;
    this._deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
    this._nonDevDeps = pkg.dependencies;
    this._pkgs = new Map();
    this._paths = new Map();
  }

  hasDependency(name) {
    return Boolean(this._deps[name]);
  }

  isEmberAddon(name) {
    let keywords = get(this._pkg(name), 'keywords');
    return keywords && keywords.includes("ember-addon");
  }

  assertAllowed(name) {
    if (this._insideAddon && !this._nonDevDeps[name]) {
      throw new Error(`You tried to import "${name}" from addon code, but "${name}" is a devDependency. You may need to move it into dependencies.`);
    }
  }

  _pkg(name) {
    if (!this._pkgs.has(name)) {
      let pkgPath = this.packageRoot(name);
      if (pkgPath) {
        this._pkgs.set(name, require(path.join(pkgPath, 'package.json')));
      } else {
        this._pkgs.set(name, null);
      }
    }
    return this._pkgs.get(name);
  }

  packageRoot(name) {
    if (!this._paths.has(name)) {
      this._paths.set(name, path.dirname(resolve.sync(`${name}/package.json`, { basedir: this._project.root })));
    }
    return this._paths.get(name);
  }

  entryPoint(name, innerPath) {
    let pkg = this._pkg(name);
    let packagePath = this.packageRoot(name);
    if (innerPath) {
      return require.resolve(path.join(packagePath, innerPath));
    } else {
      // Priority goes to native ES module implementations, then
      // browser-specific implementations, then normal defaults for
      // main.
      let localEntrypoint = pkg.module || pkg.browser || pkg.main || 'index.js';
      return path.join(packagePath, localEntrypoint);
    }
  }
}
