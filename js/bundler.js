"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const broccoli_plugin_1 = __importDefault(require("broccoli-plugin"));
const debug_1 = __importDefault(require("debug"));
const webpack_1 = __importDefault(require("./webpack"));
const package_1 = require("./package");
const lodash_1 = require("lodash");
const path_1 = require("path");
const fs_extra_1 = require("fs-extra");
const typescript_memoize_1 = require("typescript-memoize");
const broccoli_source_1 = require("broccoli-source");
const debug = debug_1.default('ember-auto-import:bundler');
class Bundler extends broccoli_plugin_1.default {
    constructor(allAppTree, options) {
        let deps = depsFor(allAppTree, options.packages);
        super(deps, {
            persistentOutput: true,
            needsCache: true,
        });
        this.options = options;
        this.didEnsureDirs = false;
        this.isWatchingSomeDeps = deps.length > 1;
    }
    get rootPackage() {
        let rootPackage = [...this.options.packages.values()].find(pkg => !pkg.isAddon);
        if (!rootPackage) {
            throw new Error(`bug in ember-auto-import, there should always be a Package representing the app`);
        }
        return rootPackage;
    }
    get publicAssetURL() {
        // Only the app (not an addon) can customize the public asset URL, because
        // it's an app concern.
        return this.rootPackage.publicAssetURL;
    }
    get skipBabel() {
        let output = [];
        for (let pkg of this.options.packages) {
            let skip = pkg.skipBabel;
            if (skip) {
                output = output.concat(skip);
            }
        }
        return output;
    }
    get bundlerHook() {
        if (!this.cachedBundlerHook) {
            let extraWebpackConfig = lodash_1.mergeWith({}, ...[...this.options.packages.values()].map(pkg => pkg.webpackConfig), (objValue, srcValue) => {
                // arrays concat
                if (Array.isArray(objValue)) {
                    return objValue.concat(srcValue);
                }
            });
            if ([...this.options.packages.values()].find(pkg => pkg.forbidsEval)) {
                extraWebpackConfig.devtool = 'source-map';
            }
            debug('extraWebpackConfig %j', extraWebpackConfig);
            this.cachedBundlerHook = new webpack_1.default(this.options.bundles, this.options.environment, extraWebpackConfig, this.options.consoleWrite, this.publicAssetURL, this.skipBabel, this.options.targets, this.cachePath // cast is OK because we passed needsCache: true to super constructor
            );
        }
        return this.cachedBundlerHook;
    }
    build() {
        return __awaiter(this, void 0, void 0, function* () {
            this.ensureDirs();
            package_1.reloadDevPackages();
            let { splitter } = this.options;
            let bundleDeps = yield splitter.deps();
            if (bundleDeps !== this.lastDeps || this.isWatchingSomeDeps) {
                let buildResult = yield this.bundlerHook.build(bundleDeps);
                this.addEntrypoints(buildResult);
                this.addLazyAssets(buildResult);
                this.lastDeps = bundleDeps;
            }
        });
    }
    ensureDirs() {
        if (this.didEnsureDirs) {
            return;
        }
        fs_extra_1.emptyDirSync(path_1.join(this.outputPath, 'lazy'));
        for (let bundle of this.options.bundles.names) {
            fs_extra_1.emptyDirSync(path_1.join(this.outputPath, 'entrypoints', bundle));
        }
        this.didEnsureDirs = true;
    }
    addEntrypoints({ entrypoints, dir }) {
        for (let bundle of this.options.bundles.names) {
            if (entrypoints.has(bundle)) {
                entrypoints.get(bundle).forEach(asset => {
                    fs_extra_1.copySync(path_1.join(dir, asset), path_1.join(this.outputPath, 'entrypoints', bundle, asset));
                });
            }
        }
    }
    addLazyAssets({ lazyAssets, dir }) {
        let contents = lazyAssets
            .map(asset => {
            // we copy every lazy asset into place here
            let content = fs_extra_1.readFileSync(path_1.join(dir, asset));
            fs_extra_1.writeFileSync(path_1.join(this.outputPath, 'lazy', asset), content);
            // and then for JS assets, we also save a copy to put into the fastboot
            // combined bundle. We don't want to include other things like WASM here
            // that can't be concatenated.
            if (/\.js$/i.test(asset)) {
                return content;
            }
        })
            .filter(Boolean);
        if (this.rootPackage.isFastBootEnabled) {
            fs_extra_1.writeFileSync(path_1.join(this.outputPath, 'lazy', 'auto-import-fastboot.js'), contents.join('\n'));
        }
    }
}
__decorate([
    typescript_memoize_1.Memoize()
], Bundler.prototype, "rootPackage", null);
exports.default = Bundler;
function depsFor(allAppTree, packages) {
    let deps = [allAppTree];
    for (let pkg of packages) {
        let watched = pkg.watchedDirectories;
        if (watched) {
            deps = deps.concat(watched.map(dir => new broccoli_source_1.WatchedDir(dir)));
        }
    }
    return deps;
}
//# sourceMappingURL=bundler.js.map