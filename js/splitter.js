"use strict";
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
exports.sharedResolverOptions = void 0;
const debug_1 = __importDefault(require("debug"));
const util_1 = require("./util");
const lodash_1 = require("lodash");
const enhanced_resolve_1 = require("enhanced-resolve");
const resolve_package_path_1 = require("resolve-package-path");
const path_1 = require("path");
const debug = debug_1.default('ember-auto-import:splitter');
// these are here because we do our own resolving of entrypoints, so we
// configure enhanced-resolve directly. But in the case of template literal
// imports, we only resolve down to the right directory and leave the file
// discovery up to webpack, so webpack needs to also know the options we're
// using.
exports.sharedResolverOptions = {
    extensions: ['.js', '.ts', '.json'],
    mainFields: ['browser', 'module', 'main'],
};
const resolver = enhanced_resolve_1.ResolverFactory.createResolver(Object.assign({ 
    // upstream types seem to be broken here
    fileSystem: new enhanced_resolve_1.CachedInputFileSystem(new enhanced_resolve_1.NodeJsInputFileSystem(), 4000) }, exports.sharedResolverOptions));
class Splitter {
    constructor(options) {
        this.options = options;
        this.lastDeps = null;
        this.packageVersions = new Map();
    }
    deps() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.importsChanged()) {
                this.lastDeps = yield this.computeDeps(this.options.analyzers);
                debug('output %s', new LazyPrintDeps(this.lastDeps));
            }
            return this.lastDeps;
        });
    }
    importsChanged() {
        let imports = [...this.options.analyzers.keys()].map(analyzer => analyzer.imports);
        if (!this.lastImports || !util_1.shallowEqual(this.lastImports, imports)) {
            this.lastImports = imports;
            return true;
        }
        return false;
    }
    computeTargets(analyzers) {
        return __awaiter(this, void 0, void 0, function* () {
            let targets = new Map();
            let templateTargets = new Map();
            let imports = lodash_1.flatten([...analyzers.keys()].map(analyzer => analyzer.imports));
            yield Promise.all(imports.map((imp) => __awaiter(this, void 0, void 0, function* () {
                if ('specifier' in imp) {
                    yield this.handleLiteralImport(imp, targets);
                }
                else {
                    yield this.handleTemplateImport(imp, templateTargets);
                }
            })));
            return { targets, templateTargets };
        });
    }
    handleLiteralImport(imp, targets) {
        return __awaiter(this, void 0, void 0, function* () {
            let target = imp.package.resolve(imp.specifier);
            if (!target) {
                return;
            }
            if (target.type === 'url') {
                // people can statically import from URLs if they want to, that's clearly
                // nothing to do with us (though in practice the rest of ember-cli will
                // generally be sad about this)
                return;
            }
            if (target.type === 'local') {
                // we're only trying to identify imports of external NPM
                // packages, so relative imports are never relevant.
                if (imp.isDynamic) {
                    throw new Error(`ember-auto-import does not support dynamic relative imports. "${imp.specifier}" is relative. To make this work, you need to upgrade to Embroider.`);
                }
                return;
            }
            let entrypoint = yield resolveEntrypoint(target.path, imp.package);
            let seenAlready = targets.get(imp.specifier);
            if (seenAlready) {
                yield this.assertSafeVersion(seenAlready.entrypoint, seenAlready.importedBy[0], imp, entrypoint);
                seenAlready.importedBy.push(imp);
            }
            else {
                targets.set(imp.specifier, {
                    specifier: imp.specifier,
                    entrypoint,
                    importedBy: [imp],
                });
            }
        });
    }
    handleTemplateImport(imp, targets) {
        return __awaiter(this, void 0, void 0, function* () {
            let [leadingQuasi, ...rest] = imp.cookedQuasis;
            let target = imp.package.resolve(leadingQuasi, true);
            if (!target) {
                throw new Error(`ember-auto-import is unable to handle ${leadingQuasi}`);
            }
            if (target.type === 'local') {
                throw new Error(`ember-auto-import does not support dynamic relative imports. "${leadingQuasi}" is relative. To make this work, you need to upgrade to Embroider.`);
            }
            if (target.type === 'imprecise') {
                throw new Error(`Dynamic imports must target unambiguous package names. ${leadingQuasi} is ambiguous`);
            }
            if (target.type === 'url') {
                return;
            }
            // this just makes the key look pleasantly like the original template
            // string, there's nothing magical about "e" here, it just means "an
            // expression goes here and we don't care which one".c
            let specifierKey = imp.cookedQuasis.join('${e}');
            let entrypoint = path_1.join(target.packagePath.slice(0, -1 * 'package.json'.length), target.local);
            let seenAlready = targets.get(specifierKey);
            if (seenAlready) {
                yield this.assertSafeVersion(seenAlready.cookedQuasis[0], seenAlready.importedBy[0], imp, entrypoint);
                seenAlready.importedBy.push(imp);
            }
            else {
                targets.set(specifierKey, {
                    cookedQuasis: [entrypoint, ...rest],
                    expressionNameHints: imp.expressionNameHints.map((hint, index) => hint || `arg${index}`),
                    importedBy: [imp],
                });
            }
        });
    }
    versionOfPackage(entrypoint) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.packageVersions.has(entrypoint)) {
                return this.packageVersions.get(entrypoint);
            }
            let pkgPath = resolve_package_path_1.findUpPackagePath(path_1.dirname(entrypoint));
            let version = null;
            if (pkgPath) {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                let pkg = require(pkgPath);
                version = pkg.version;
            }
            this.packageVersions.set(entrypoint, version);
            return version;
        });
    }
    assertSafeVersion(haveEntrypoint, prevImport, nextImport, entrypoint) {
        return __awaiter(this, void 0, void 0, function* () {
            if (haveEntrypoint === entrypoint) {
                // both import statements are resolving to the exact same entrypoint --
                // this is the normal and happy case
                return;
            }
            let [haveVersion, nextVersion] = yield Promise.all([
                this.versionOfPackage(haveEntrypoint),
                this.versionOfPackage(entrypoint),
            ]);
            if (haveVersion !== nextVersion) {
                throw new Error(`${nextImport.package.name} and ${prevImport.package.name} are using different versions of ${'specifier' in prevImport ? prevImport.specifier : prevImport.cookedQuasis[0]} (${nextVersion} located at ${entrypoint} vs ${haveVersion} located at ${haveEntrypoint})`);
            }
        });
    }
    computeDeps(analyzers) {
        return __awaiter(this, void 0, void 0, function* () {
            let targets = yield this.computeTargets(analyzers);
            let deps = new Map();
            this.options.bundles.names.forEach(bundleName => {
                deps.set(bundleName, {
                    staticImports: [],
                    dynamicImports: [],
                    dynamicTemplateImports: [],
                });
            });
            for (let target of targets.targets.values()) {
                let [dynamicUses, staticUses] = lodash_1.partition(target.importedBy, imp => imp.isDynamic);
                if (staticUses.length > 0) {
                    let bundleName = this.chooseBundle(staticUses);
                    deps.get(bundleName).staticImports.push(target);
                }
                if (dynamicUses.length > 0) {
                    let bundleName = this.chooseBundle(dynamicUses);
                    deps.get(bundleName).dynamicImports.push(target);
                }
            }
            for (let target of targets.templateTargets.values()) {
                let bundleName = this.chooseBundle(target.importedBy);
                deps.get(bundleName).dynamicTemplateImports.push(target);
            }
            this.sortDependencies(deps);
            return deps;
        });
    }
    sortDependencies(deps) {
        for (const bundle of deps.values()) {
            this.sortBundle(bundle);
        }
    }
    sortBundle(bundle) {
        bundle.staticImports.sort((a, b) => a.specifier.localeCompare(b.specifier));
        bundle.dynamicImports.sort((a, b) => a.specifier.localeCompare(b.specifier));
        bundle.dynamicTemplateImports.sort((a, b) => a.cookedQuasis[0].localeCompare(b.cookedQuasis[0]));
    }
    // given that a module is imported by the given list of paths, which
    // bundle should it go in?
    chooseBundle(importedBy) {
        let usedInBundles = {};
        importedBy.forEach(usage => {
            usedInBundles[this.bundleFor(usage)] = true;
        });
        return this.options.bundles.names.find(bundle => usedInBundles[bundle]);
    }
    bundleFor(usage) {
        let bundleName = usage.treeType === undefined || typeof this.options.bundles.bundleForTreeType !== 'function'
            ? this.options.bundles.bundleForPath(usage.path)
            : this.options.bundles.bundleForTreeType(usage.treeType);
        if (this.options.bundles.names.indexOf(bundleName) === -1) {
            throw new Error(`bundleForPath("${usage.path}") returned ${bundleName}" but the only configured bundle names are ${this.options.bundles.names.join(',')}`);
        }
        debug('bundleForPath("%s")=%s', usage.path, bundleName);
        return bundleName;
    }
}
exports.default = Splitter;
function resolveEntrypoint(specifier, pkg) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolvePromise, reject) => {
            // upstream types seem to be out of date here
            resolver.resolve({}, pkg.root, specifier, {}, (err, path) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolvePromise(path);
                }
            });
        });
    });
}
class LazyPrintDeps {
    constructor(deps) {
        this.deps = deps;
    }
    describeResolvedImport(imp) {
        return {
            specifier: imp.specifier,
            entrypoint: imp.entrypoint,
            importedBy: imp.importedBy.map(this.describeImport.bind(this)),
        };
    }
    describeImport(imp) {
        return {
            package: imp.package.name,
            path: imp.path,
        };
    }
    describeTemplateImport(imp) {
        return {
            cookedQuasis: imp.cookedQuasis,
            expressionNameHints: imp.expressionNameHints,
            importedBy: imp.importedBy.map(this.describeImport.bind(this)),
        };
    }
    toString() {
        let output = {};
        for (let [bundle, { staticImports, dynamicImports, dynamicTemplateImports }] of this.deps.entries()) {
            output[bundle] = {
                static: staticImports.map(this.describeResolvedImport.bind(this)),
                dynamic: dynamicImports.map(this.describeResolvedImport.bind(this)),
                dynamicTemplate: dynamicTemplateImports.map(this.describeTemplateImport.bind(this)),
            };
        }
        return JSON.stringify(output, null, 2);
    }
}
//# sourceMappingURL=splitter.js.map