const resolve = require('resolve');
const { get } = require('lodash');

module.exports = class {
  constructor(project, insideAddon) {
    this._project = project;
    this._insideAddon = insideAddon;
    let pkg = project.pkg;
    this._deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
    this._nonDevDeps = pkg.dependencies;
    this._pkgs = new Map();
    this._entryPoints = new Map();
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
      let path = resolve.sync(`${name}/package.json`, { basedir: this._project.root });
      if (path) {
        this._pkgs.set(name, require(path));
      } else {
        this._pkgs.set(name, null);
      }
    }
    return this._pkgs.get(name);
  }

  entryPoint(name) {
    if (!this._entryPoints.has(name)) {
      this._entryPoints.set(name, resolve.sync(name, { basedir: this._project.root }));
    }
    return this._entryPoints.get(name);
  }
}
