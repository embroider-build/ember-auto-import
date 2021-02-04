"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
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
const walk_sync_1 = __importDefault(require("walk-sync"));
const fs_extra_1 = require("fs-extra");
const fs_tree_diff_1 = __importDefault(require("fs-tree-diff"));
const debug_1 = __importDefault(require("debug"));
const path_1 = require("path");
const lodash_1 = require("lodash");
const symlink_or_copy_1 = __importDefault(require("symlink-or-copy"));
const traverse_1 = __importDefault(require("@babel/traverse"));
debug_1.default.formatters.m = (modules) => {
    return JSON.stringify(modules.map(m => {
        if ('specifier' in m) {
            return {
                specifier: m.specifier,
                path: m.path,
                isDynamic: m.isDynamic,
                package: m.package.name,
                treeType: m.treeType,
            };
        }
        else {
            return {
                cookedQuasis: m.cookedQuasis,
                expressionNameHints: m.expressionNameHints,
                path: m.path,
                package: m.package.name,
                treeType: m.treeType,
            };
        }
    }), null, 2);
};
const debug = debug_1.default('ember-auto-import:analyzer');
/*
  Analyzer discovers and maintains info on all the module imports that
  appear in a broccoli tree.
*/
class Analyzer extends broccoli_plugin_1.default {
    constructor(inputTree, pack, treeType) {
        super([inputTree], {
            annotation: 'ember-auto-import-analyzer',
            persistentOutput: true,
        });
        this.pack = pack;
        this.treeType = treeType;
        this.previousTree = new fs_tree_diff_1.default();
        this.modules = [];
        this.paths = new Map();
    }
    setupParser() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.parse) {
                return;
            }
            switch (this.pack.babelMajorVersion) {
                case 6:
                    this.parse = yield babel6Parser(this.pack.babelOptions);
                    break;
                case 7:
                    this.parse = yield babel7Parser(this.pack.babelOptions);
                    break;
                default:
                    throw new Error(`don't know how to setup a parser for Babel version ${this.pack.babelMajorVersion} (used by ${this.pack.name})`);
            }
        });
    }
    get imports() {
        if (!this.modules) {
            this.modules = lodash_1.flatten([...this.paths.values()]);
            debug('imports %m', this.modules);
        }
        return this.modules;
    }
    build() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.setupParser();
            this.getPatchset().forEach(([operation, relativePath]) => {
                let outputPath = path_1.join(this.outputPath, relativePath);
                switch (operation) {
                    case 'unlink':
                        if (this.matchesExtension(relativePath)) {
                            this.removeImports(relativePath);
                        }
                        fs_extra_1.unlinkSync(outputPath);
                        break;
                    case 'rmdir':
                        fs_extra_1.rmdirSync(outputPath);
                        break;
                    case 'mkdir':
                        fs_extra_1.mkdirSync(outputPath);
                        break;
                    case 'change':
                        fs_extra_1.removeSync(outputPath);
                    // deliberate fallthrough
                    case 'create': {
                        let absoluteInputPath = path_1.join(this.inputPaths[0], relativePath);
                        if (this.matchesExtension(relativePath)) {
                            this.updateImports(relativePath, fs_extra_1.readFileSync(absoluteInputPath, 'utf8'));
                        }
                        symlink_or_copy_1.default.sync(absoluteInputPath, outputPath);
                    }
                }
            });
        });
    }
    getPatchset() {
        let input = walk_sync_1.default.entries(this.inputPaths[0]);
        let previous = this.previousTree;
        let next = (this.previousTree = fs_tree_diff_1.default.fromEntries(input));
        return previous.calculatePatch(next);
    }
    matchesExtension(path) {
        return this.pack.fileExtensions.includes(path_1.extname(path).slice(1));
    }
    removeImports(relativePath) {
        debug(`removing imports for ${relativePath}`);
        let imports = this.paths.get(relativePath);
        if (imports) {
            if (imports.length > 0) {
                this.modules = null; // invalidates cache
            }
            this.paths.delete(relativePath);
        }
    }
    updateImports(relativePath, source) {
        debug(`updating imports for ${relativePath}, ${source.length}`);
        let newImports = this.parseImports(relativePath, source);
        if (!lodash_1.isEqual(this.paths.get(relativePath), newImports)) {
            this.paths.set(relativePath, newImports);
            this.modules = null; // invalidates cache
        }
    }
    parseImports(relativePath, source) {
        let ast;
        try {
            ast = this.parse(source);
        }
        catch (err) {
            if (err.name !== 'SyntaxError') {
                throw err;
            }
            debug('Ignoring an unparseable file');
        }
        let imports = [];
        if (!ast) {
            return imports;
        }
        traverse_1.default(ast, {
            CallExpression: path => {
                if (path.node.callee.type === 'Import') {
                    // it's a syntax error to have anything other than exactly one
                    // argument, so we can just assume this exists
                    let argument = path.node.arguments[0];
                    switch (argument.type) {
                        case 'StringLiteral':
                            imports.push({
                                isDynamic: true,
                                specifier: argument.value,
                                path: relativePath,
                                package: this.pack,
                                treeType: this.treeType,
                            });
                            break;
                        case 'TemplateLiteral':
                            if (argument.quasis.length === 1) {
                                imports.push({
                                    isDynamic: true,
                                    specifier: argument.quasis[0].value.cooked,
                                    path: relativePath,
                                    package: this.pack,
                                    treeType: this.treeType,
                                });
                            }
                            else {
                                imports.push({
                                    cookedQuasis: argument.quasis.map(templateElement => templateElement.value.cooked),
                                    expressionNameHints: [...argument.expressions].map(inferNameHint),
                                    path: relativePath,
                                    package: this.pack,
                                    treeType: this.treeType,
                                });
                            }
                            break;
                        default:
                            throw new Error('import() is only allowed to contain string literals or template string literals');
                    }
                }
            },
            ImportDeclaration: path => {
                imports.push({
                    isDynamic: false,
                    specifier: path.node.source.value,
                    path: relativePath,
                    package: this.pack,
                    treeType: this.treeType,
                });
            },
            ExportNamedDeclaration: path => {
                if (path.node.source) {
                    imports.push({
                        isDynamic: false,
                        specifier: path.node.source.value,
                        path: relativePath,
                        package: this.pack,
                        treeType: this.treeType,
                    });
                }
            },
        });
        return imports;
    }
}
exports.default = Analyzer;
function babel6Parser(babelOptions) {
    return __awaiter(this, void 0, void 0, function* () {
        let core = Promise.resolve().then(() => __importStar(require('babel-core')));
        let babylon = Promise.resolve().then(() => __importStar(require('babylon')));
        // missing upstream types (or we are using private API, because babel 6 didn't
        // have a good way to construct a parser directly from the general babel
        // options)
        const { Pipeline, File } = (yield core);
        const { parse } = yield babylon;
        let p = new Pipeline();
        let f = new File(babelOptions, p);
        let options = f.parserOpts;
        return function (source) {
            return parse(source, options);
        };
    });
}
function babel7Parser(babelOptions) {
    return __awaiter(this, void 0, void 0, function* () {
        let core = Promise.resolve().then(() => __importStar(require('@babel/core')));
        const { parseSync } = yield core;
        return function (source) {
            return parseSync(source, babelOptions);
        };
    });
}
function inferNameHint(exp) {
    if (exp.type === 'Identifier') {
        return exp.name;
    }
}
//# sourceMappingURL=analyzer.js.map