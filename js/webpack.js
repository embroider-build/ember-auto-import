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
exports.mergeConfig = void 0;
const webpack_1 = __importDefault(require("webpack"));
const path_1 = require("path");
const lodash_1 = require("lodash");
const fs_1 = require("fs");
const handlebars_1 = require("handlebars");
const js_string_escape_1 = __importDefault(require("js-string-escape"));
const splitter_1 = require("./splitter");
const fs_extra_1 = require("fs-extra");
const core_1 = require("@embroider/core");
handlebars_1.registerHelper('js-string-escape', js_string_escape_1.default);
handlebars_1.registerHelper('join', function (list, connector) {
    return list.join(connector);
});
const entryTemplate = handlebars_1.compile(`
if (typeof document !== 'undefined') {
  {{#if publicAssetURL}}
  __webpack_public_path__ = '{{js-string-escape publicAssetURL}}';
  {{else}}
  {{!
      locate the webpack lazy loaded chunks relative to the currently executing
      script. The last <script> in DOM should be us, assuming that we are being
      synchronously loaded, which is the normal thing to do. If people are doing
      weirder things than that, they may need to explicitly set a publicAssetURL
      instead.
  }}
  __webpack_public_path__ = (function(){
    var scripts = document.querySelectorAll('script');
    return scripts[scripts.length - 1].src.replace(/\\/[^/]*$/, '/');
  })();
  {{/if}}
}

module.exports = (function(){
  var d = _eai_d;
  var r = _eai_r;
  window.emberAutoImportDynamic = function(specifier) {
    if (arguments.length === 1) {
      return r('_eai_dyn_' + specifier);
    } else {
      return r('_eai_dynt_' + specifier)(Array.prototype.slice.call(arguments, 1))
    }
  };
  {{#each staticImports as |module|}}
    d('{{js-string-escape module.specifier}}', [], function() { return require('{{js-string-escape module.entrypoint}}'); });
  {{/each}}
  {{#each dynamicImports as |module|}}
    d('_eai_dyn_{{js-string-escape module.specifier}}', [], function() { return import('{{js-string-escape module.entrypoint}}'); });
  {{/each}}
  {{#each dynamicTemplateImports as |module|}}
    d('_eai_dynt_{{js-string-escape module.key}}', [], function() {
      return function({{module.args}}) {
        return import({{{module.template}}});
      }
    });
  {{/each}}
})();
`);
// this goes in a file by itself so we can tell webpack not to parse it. That
// allows us to grab the "require" and "define" from our enclosing scope without
// webpack messing with them.
//
// It's important that we're using our enclosing scope and not jumping directly
// to window.require (which would be easier), because the entire Ember app may be
// inside a closure with a "require" that isn't the same as "window.require".
const loader = `
window._eai_r = require;
window._eai_d = define;
`;
class WebpackBundler {
    constructor(bundles, environment, extraWebpackConfig, consoleWrite, publicAssetURL, skipBabel, babelTargets, tempArea) {
        this.consoleWrite = consoleWrite;
        this.publicAssetURL = publicAssetURL;
        this.skipBabel = skipBabel;
        this.babelTargets = babelTargets;
        // resolve the real path, because we're going to do path comparisons later
        // that could fail if this is not canonical.
        tempArea = fs_1.realpathSync(tempArea);
        this.stagingDir = path_1.join(tempArea, 'staging');
        fs_extra_1.ensureDirSync(this.stagingDir);
        this.outputDir = path_1.join(tempArea, 'output');
        fs_extra_1.ensureDirSync(this.outputDir);
        let entry = {};
        bundles.names.forEach(bundle => {
            entry[bundle] = [path_1.join(this.stagingDir, 'l.js'), path_1.join(this.stagingDir, `${bundle}.js`)];
        });
        let config = {
            mode: environment === 'production' ? 'production' : 'development',
            entry,
            performance: {
                hints: false,
            },
            output: {
                path: this.outputDir,
                filename: `chunk.[id].js`,
                chunkFilename: `chunk.[id].[chunkhash].js`,
                libraryTarget: 'var',
                library: '__ember_auto_import__',
            },
            optimization: {
                splitChunks: {
                    chunks: 'all',
                },
            },
            resolveLoader: {
                alias: {
                    // these loaders are our dependencies, not the app's dependencies. I'm
                    // not overriding the default loader resolution rules in case the app also
                    // wants to control those.
                    'babel-loader-8': require.resolve('babel-loader'),
                },
            },
            resolve: Object.assign({}, splitter_1.sharedResolverOptions),
            module: {
                noParse: file => file === path_1.join(this.stagingDir, 'l.js'),
                rules: [this.babelRule()],
            },
            node: false,
        };
        if (extraWebpackConfig) {
            mergeConfig(config, extraWebpackConfig);
        }
        this.webpack = webpack_1.default(config);
    }
    babelRule() {
        let shouldTranspile = core_1.babelFilter(this.skipBabel);
        let stagingDir = this.stagingDir;
        return {
            test(filename) {
                // We don't apply babel to our own stagingDir (it contains only our own
                // entrypoints that we wrote, and it can use `import()`, which we want
                // to leave directly for webpack).
                //
                // And we otherwise defer to the `skipBabel` setting as implemented by
                // `@embroider/core`.
                return path_1.dirname(filename) !== stagingDir && shouldTranspile(filename);
            },
            use: {
                loader: 'babel-loader-8',
                options: {
                    presets: [
                        [
                            require.resolve('@babel/preset-env'),
                            {
                                modules: false,
                                targets: this.babelTargets,
                            },
                        ],
                    ],
                },
            },
        };
    }
    build(bundleDeps) {
        return __awaiter(this, void 0, void 0, function* () {
            for (let [bundle, deps] of bundleDeps.entries()) {
                this.writeEntryFile(bundle, deps);
            }
            this.writeLoaderFile();
            let stats = yield this.runWebpack();
            return this.summarizeStats(stats);
        });
    }
    summarizeStats(_stats) {
        let stats = _stats.toJson();
        let output = {
            entrypoints: new Map(),
            lazyAssets: [],
            dir: this.outputDir,
        };
        let nonLazyAssets = new Set();
        for (let id of Object.keys(stats.entrypoints)) {
            let entrypoint = stats.entrypoints[id];
            output.entrypoints.set(id, entrypoint.assets);
            entrypoint.assets.forEach((asset) => nonLazyAssets.add(asset));
        }
        for (let asset of stats.assets) {
            if (!nonLazyAssets.has(asset.name)) {
                output.lazyAssets.push(asset.name);
            }
        }
        return output;
    }
    writeEntryFile(name, deps) {
        fs_1.writeFileSync(path_1.join(this.stagingDir, `${name}.js`), entryTemplate({
            staticImports: deps.staticImports,
            dynamicImports: deps.dynamicImports,
            dynamicTemplateImports: deps.dynamicTemplateImports.map(imp => ({
                key: imp.importedBy[0].cookedQuasis.join('${e}'),
                args: imp.expressionNameHints.join(','),
                template: '`' +
                    lodash_1.zip(imp.cookedQuasis, imp.expressionNameHints)
                        .map(([q, e]) => q + (e ? '${' + e + '}' : ''))
                        .join('') +
                    '`',
            })),
            publicAssetURL: this.publicAssetURL,
        }));
    }
    writeLoaderFile() {
        fs_1.writeFileSync(path_1.join(this.stagingDir, `l.js`), loader);
    }
    runWebpack() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.webpack.run((err, stats) => {
                    if (err) {
                        this.consoleWrite(stats.toString());
                        reject(err);
                        return;
                    }
                    if (stats.hasErrors()) {
                        this.consoleWrite(stats.toString());
                        reject(new Error('webpack returned errors to ember-auto-import'));
                        return;
                    }
                    if (stats.hasWarnings() || process.env.AUTO_IMPORT_VERBOSE) {
                        this.consoleWrite(stats.toString());
                    }
                    // this cast is justified because we already checked hasErrors above
                    resolve(stats);
                });
            });
        });
    }
}
exports.default = WebpackBundler;
function mergeConfig(dest, ...srcs) {
    return lodash_1.mergeWith(dest, ...srcs, combine);
}
exports.mergeConfig = mergeConfig;
function combine(objValue, srcValue, key) {
    if (key === 'noParse') {
        return eitherPattern(objValue, srcValue);
    }
    // arrays concat
    if (Array.isArray(objValue)) {
        return objValue.concat(srcValue);
    }
}
// webpack configs have several places where they accept:
//   - RegExp
//   - [RegExp]
//   - (resource: string) => boolean
//   - string
//   - [string]
// This function combines any of these with a logical OR.
function eitherPattern(...patterns) {
    let flatPatterns = lodash_1.flatten(patterns);
    return function (resource) {
        for (let pattern of flatPatterns) {
            if (pattern instanceof RegExp) {
                if (pattern.test(resource)) {
                    return true;
                }
            }
            else if (typeof pattern === 'string') {
                if (pattern === resource) {
                    return true;
                }
            }
            else if (typeof pattern === 'function') {
                if (pattern(resource)) {
                    return true;
                }
            }
        }
        return false;
    };
}
//# sourceMappingURL=webpack.js.map