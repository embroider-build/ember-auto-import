"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
// @ts-ignore
const babel_plugin_syntax_dynamic_import_1 = __importDefault(require("babel-plugin-syntax-dynamic-import"));
const types_1 = require("@babel/types");
const package_1 = __importDefault(require("./package"));
function emberAutoImport() {
    return {
        inherits: babel_plugin_syntax_dynamic_import_1.default,
        visitor: {
            Import(path) {
                let call = path.parentPath;
                let arg = call.node.arguments[0];
                if (arg.type === 'StringLiteral') {
                    let cat = package_1.default.categorize(arg.value);
                    if (cat === 'dep') {
                        call.replaceWith(types_1.callExpression(types_1.identifier('emberAutoImportDynamic'), [arg]));
                    }
                }
                else if (arg.type === 'TemplateLiteral') {
                    let cat = package_1.default.categorize(arg.quasis[0].value.cooked, true);
                    if (cat === 'dep') {
                        call.replaceWith(types_1.callExpression(types_1.identifier('emberAutoImportDynamic'), [
                            types_1.stringLiteral(arg.quasis.map(q => q.value.cooked).join('${e}')),
                            ...arg.expressions,
                        ]));
                    }
                }
            },
        },
    };
}
emberAutoImport.baseDir = function () {
    return __dirname;
};
module.exports = emberAutoImport;
//# sourceMappingURL=babel-plugin.js.map