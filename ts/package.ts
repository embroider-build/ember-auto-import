import resolve from 'resolve';

export default class Package {
    public name: string;
    public root: string;
    public isAddon: boolean;
    public babelOptions;
    public autoImportOptions;
    private deps;
    private nonDevDeps;
    private isAddonCache = new Map<string, boolean>();

    constructor(instance){
        this.name = instance.parent.pkg.name;
        this.root = instance.parent.root;

        // When consumed by an addon, we will see
        // instance.parent.options. When consumed by an app, we will have
        // instance.app.options.
        this.isAddon = !!instance.parent.options;

        // This is the per-package options from ember-cli
        let options = instance.parent.options || instance.app.options;

        // Stash our own config options
        this.autoImportOptions = options.autoImport || {};
        if (!this.autoImportOptions.modules) {
          this.autoImportOptions.modules = Object.create(null);
        }

        this.babelOptions = this.buildBabelOptions(instance, options);

        let pkg = instance.parent.pkg;
        this.deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
        this.nonDevDeps = pkg.dependencies;
    }

    private buildBabelOptions(instance, options){
        // Generate the same babel options that the package (meaning app or addon)
        // is using. We will use these so we can configure our parser to
        // match.
        let babelAddon = instance.addons.find(addon => addon.name === 'ember-cli-babel');
        let babelOptions = babelAddon.buildBabelOptions(options);
        // https://github.com/babel/ember-cli-babel/issues/227
        delete babelOptions.annotation;
        delete babelOptions.throwUnlessParallelizable;
        if (babelOptions.plugins) {
            babelOptions.plugins = babelOptions.plugins.filter(p => !p._parallelBabel);
        }
        return babelOptions;
    }

    get namespace() : string {
        // This namespacing ensures we can be used by multiple packages as
        // well as by an addon and its dummy app simultaneously
        return `${this.name}/${this.isAddon ? 'addon' : 'app'}`;
    }

    hasDependency(name) : boolean {
        return Boolean(this.deps[name]);
    }

    isEmberAddonDependency(name) : boolean {
        if (!this.isAddonCache.has(name)){
            let packageJSON = require(resolve.sync(`${name}/package.json`, { basedir: this.root }));
            let keywords = packageJSON.keywords;
            this.isAddonCache.set(name, keywords && keywords.includes("ember-addon"));
        }
        return this.isAddonCache.get(name);
    }

    assertAllowedDependency(name) {
      if (this.isAddon && !this.nonDevDeps[name]) {
        throw new Error(`${this.name} tried to import "${name}" from addon code, but "${name}" is a devDependency. You may need to move it into dependencies.`);
      }
    }
}
