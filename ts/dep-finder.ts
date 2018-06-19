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
  private deps;
  private nonDevDeps;
  private pkgs = new Map();
  private paths = new Map();

  constructor(private project, private insideAddon) {
    let pkg = project.pkg;
    this.deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
    this.nonDevDeps = pkg.dependencies;
  }

  hasDependency(name) {
    return Boolean(this.deps[name]);
  }

  isEmberAddon(name) {
    let keywords = get(this.pkg(name), 'keywords');
    return keywords && keywords.includes("ember-addon");
  }

  assertAllowed(name) {
    if (this.insideAddon && !this.nonDevDeps[name]) {
      throw new Error(`You tried to import "${name}" from addon code, but "${name}" is a devDependency. You may need to move it into dependencies.`);
    }
  }

  private pkg(name) {
    if (!this.pkgs.has(name)) {
      let pkgPath = this.packageRoot(name);
      if (pkgPath) {
        this.pkgs.set(name, require(join(pkgPath, 'package.json')));
      } else {
        this.pkgs.set(name, null);
      }
    }
    return this.pkgs.get(name);
  }

  private packageRoot(name) {
    if (!this.paths.has(name)) {
      this.paths.set(name, dirname(resolve.sync(`${name}/package.json`, { basedir: this.project.root })));
    }
    return this.paths.get(name);
  }

  async entryPoint(importSpecifier) {
    let path = await new Promise((resolvePromise, reject) => {
      resolver.resolve({}, this.project.root, importSpecifier, {}, (err, path) => {
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
