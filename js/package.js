"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reloadDevPackages = void 0;
const resolve_package_path_1 = __importDefault(require("resolve-package-path"));
const path_1 = require("path");
const fs_1 = require("fs");
const typescript_memoize_1 = require("typescript-memoize");
const ember_cli_models_1 = require("./ember-cli-models");
const cache = new WeakMap();
let pkgGeneration = 0;
function reloadDevPackages() {
    pkgGeneration++;
}
exports.reloadDevPackages = reloadDevPackages;
class Package {
    constructor(child) {
        this._hasBabelDetails = false;
        this.name = child.parent.pkg.name;
        this.root = child.parent.root;
        if (ember_cli_models_1.isDeepAddonInstance(child)) {
            this.isAddon = true;
            this.isDeveloping = this.root === child.project.root;
            // This is the per-package options from ember-cli
            this._options = child.parent.options;
        }
        else {
            this.isAddon = false;
            this.isDeveloping = true;
            this._options = child.app.options;
        }
        this._parent = child.parent;
        // Stash our own config options
        this.autoImportOptions = this._options.autoImport;
        this.pkgCache = child.parent.pkg;
        this.pkgGeneration = pkgGeneration;
    }
    static lookupParentOf(child) {
        if (!cache.has(child)) {
            cache.set(child, new this(child));
        }
        return cache.get(child);
    }
    _ensureBabelDetails() {
        if (this._hasBabelDetails) {
            return;
        }
        let { babelOptions, extensions, version } = this.buildBabelOptions(this._parent, this._options);
        this._emberCLIBabelExtensions = extensions;
        this._babelOptions = babelOptions;
        this._babelMajorVersion = version;
        this._hasBabelDetails = true;
    }
    get babelOptions() {
        this._ensureBabelDetails();
        return this._babelOptions;
    }
    get babelMajorVersion() {
        this._ensureBabelDetails();
        return this._babelMajorVersion;
    }
    get isFastBootEnabled() {
        return (process.env.FASTBOOT_DISABLED !== 'true' &&
            !!this._parent.addons.find(addon => addon.name === 'ember-cli-fastboot'));
    }
    buildBabelOptions(instance, options) {
        // Generate the same babel options that the package (meaning app or addon)
        // is using. We will use these so we can configure our parser to
        // match.
        let babelAddon = instance.addons.find(addon => addon.name === 'ember-cli-babel');
        let babelOptions = babelAddon.buildBabelOptions(options);
        let extensions = babelOptions.filterExtensions || ['js'];
        // https://github.com/babel/ember-cli-babel/issues/227
        delete babelOptions.annotation;
        delete babelOptions.throwUnlessParallelizable;
        delete babelOptions.filterExtensions;
        if (babelOptions.plugins) {
            babelOptions.plugins = babelOptions.plugins.filter((p) => !p._parallelBabel);
        }
        let version = parseInt(babelAddon.pkg.version.split('.')[0], 10);
        return { babelOptions, extensions, version };
    }
    get pkg() {
        if (!this.pkgCache || (this.isDeveloping && pkgGeneration !== this.pkgGeneration)) {
            // avoiding `require` here because we don't want to go through the
            // require cache.
            this.pkgCache = JSON.parse(fs_1.readFileSync(path_1.join(this.root, 'package.json'), 'utf-8'));
            this.pkgGeneration = pkgGeneration;
        }
        return this.pkgCache;
    }
    get namespace() {
        // This namespacing ensures we can be used by multiple packages as
        // well as by an addon and its dummy app simultaneously
        return `${this.name}/${this.isAddon ? 'addon' : 'app'}`;
    }
    hasDependency(name) {
        let pkg = this.pkg;
        return ((pkg.dependencies && Boolean(pkg.dependencies[name])) ||
            (pkg.devDependencies && Boolean(pkg.devDependencies[name])) ||
            (pkg.peerDependencies && Boolean(pkg.peerDependencies[name])));
    }
    hasNonDevDependency(name) {
        let pkg = this.pkg;
        return ((pkg.dependencies && Boolean(pkg.dependencies[name])) ||
            (pkg.peerDependencies && Boolean(pkg.peerDependencies[name])));
    }
    static categorize(importedPath, partial = false) {
        if (/^(\w+:)?\/\//.test(importedPath) || importedPath.startsWith('data:')) {
            return 'url';
        }
        if (importedPath[0] === '.' || importedPath[0] === '/') {
            return 'local';
        }
        if (partial && !isPrecise(importedPath)) {
            return 'imprecise';
        }
        return 'dep';
    }
    resolve(importedPath, partial = false) {
        switch (Package.categorize(importedPath, partial)) {
            case 'url':
                return { type: 'url', url: importedPath };
            case 'local':
                return {
                    type: 'local',
                    local: importedPath,
                };
            case 'imprecise':
                if (partial) {
                    return {
                        type: 'imprecise',
                    };
                }
                break;
        }
        let path = this.aliasFor(importedPath);
        let [first, ...rest] = path.split('/');
        let packageName;
        if (first[0] === '@') {
            packageName = `${first}/${rest.shift()}`;
        }
        else {
            packageName = first;
        }
        if (this.excludesDependency(packageName)) {
            // This package has been explicitly excluded.
            return;
        }
        if (!this.hasDependency(packageName)) {
            return;
        }
        let packagePath = resolve_package_path_1.default(packageName, this.root);
        if (packagePath === null) {
            throw new Error(`${this.name} tried to import "${packageName}" but the package was not resolvable from ${this.root}`);
        }
        if (isEmberAddonDependency(packagePath)) {
            // ember addon are not auto imported
            return;
        }
        this.assertAllowedDependency(packageName);
        return {
            type: 'package',
            path,
            packageName,
            local: rest.join('/'),
            packagePath,
        };
    }
    assertAllowedDependency(name) {
        if (this.isAddon && !this.hasNonDevDependency(name)) {
            throw new Error(`${this.name} tried to import "${name}" from addon code, but "${name}" is a devDependency. You may need to move it into dependencies.`);
        }
    }
    excludesDependency(name) {
        return Boolean(this.autoImportOptions && this.autoImportOptions.exclude && this.autoImportOptions.exclude.includes(name));
    }
    get webpackConfig() {
        return this.autoImportOptions && this.autoImportOptions.webpack;
    }
    get skipBabel() {
        return this.autoImportOptions && this.autoImportOptions.skipBabel;
    }
    aliasFor(name) {
        var _a;
        let alias = (_a = this.autoImportOptions) === null || _a === void 0 ? void 0 : _a.alias;
        if (!alias)
            return name;
        if (alias[name])
            return alias[name];
        let prefix = Object.keys(alias).find(p => name.startsWith(`${p}/`));
        if (prefix)
            return alias[prefix] + name.slice(prefix.length);
        return name;
    }
    get fileExtensions() {
        this._ensureBabelDetails();
        // type safety: this will have been populated by the call above
        return this._emberCLIBabelExtensions;
    }
    get publicAssetURL() {
        let url = this.autoImportOptions && this.autoImportOptions.publicAssetURL;
        if (url) {
            if (url[url.length - 1] !== '/') {
                url = url + '/';
            }
        }
        return url;
    }
    get forbidsEval() {
        // only apps (not addons) are allowed to set this, because it's motivated by
        // the apps own Content Security Policy.
        return Boolean(!this.isAddon && this.autoImportOptions && this.autoImportOptions.forbidEval);
    }
    get watchedDirectories() {
        var _a;
        // only apps (not addons) are allowed to set this
        if (!this.isAddon && ((_a = this.autoImportOptions) === null || _a === void 0 ? void 0 : _a.watchDependencies)) {
            return this.autoImportOptions.watchDependencies
                .map(name => {
                let path = resolve_package_path_1.default(name, this.root);
                if (path) {
                    return path_1.dirname(path);
                }
            })
                .filter(Boolean);
        }
    }
}
__decorate([
    typescript_memoize_1.Memoize()
], Package.prototype, "isFastBootEnabled", null);
exports.default = Package;
const isAddonCache = new Map();
function isEmberAddonDependency(pathToPackageJSON) {
    var _a;
    let cached = isAddonCache.get(pathToPackageJSON);
    if (cached === undefined) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        let packageJSON = require(pathToPackageJSON);
        let answer = ((_a = packageJSON.keywords) === null || _a === void 0 ? void 0 : _a.includes('ember-addon')) || false;
        isAddonCache.set(pathToPackageJSON, answer);
        return answer;
    }
    else {
        return cached;
    }
}
function count(str, letter) {
    return [...str].reduce((a, b) => a + (b === letter ? 1 : 0), 0);
}
function isPrecise(leadingQuasi) {
    if (leadingQuasi.startsWith('.') || leadingQuasi.startsWith('/')) {
        return true;
    }
    let slashes = count(leadingQuasi, '/');
    let minSlashes = leadingQuasi.startsWith('@') ? 2 : 1;
    return slashes >= minSlashes;
}
//# sourceMappingURL=package.js.map