import resolve from 'resolve';
import { get } from 'lodash';
import { join, dirname } from 'path';
import {
  NodeJsInputFileSystem,
  CachedInputFileSystem,
  ResolverFactory
} from 'enhanced-resolve';

const resolver = ResolverFactory.createResolver({
  fileSystem: new CachedInputFileSystem(new NodeJsInputFileSystem(), 4000),
  extensions: ['.js', '.json'],
  mainFields: ['browser', 'module', 'main']
});

export default class DepFinder {
  private _project;
  private _insideAddon;
  private _deps;
  private _nonDevDeps;
  private _pkgs;
  private _paths;

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
        this._pkgs.set(name, require(join(pkgPath, 'package.json')));
      } else {
        this._pkgs.set(name, null);
      }
    }
    return this._pkgs.get(name);
  }

  private packageRoot(name) {
    if (!this._paths.has(name)) {
      this._paths.set(name, dirname(resolve.sync(`${name}/package.json`, { basedir: this._project.root })));
    }
    return this._paths.get(name);
  }

  async entryPoint(importSpecifier) {
    let path = await new Promise((resolvePromise, reject) => {
      resolver.resolve({}, this._project.root, importSpecifier, {}, (err, path) => {
        if (err) {
          reject(err);
        } else {
          resolvePromise(path);
        }
      });
    });
    return path;
  }
}
