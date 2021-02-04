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
const qunit_1 = __importDefault(require("qunit"));
require("qunit-assertions-extra");
const broccoli_1 = __importDefault(require("broccoli"));
const broccoli_source_1 = require("broccoli-source");
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const package_1 = __importDefault(require("../package"));
const analyzer_1 = __importDefault(require("../analyzer"));
const splitter_1 = __importDefault(require("../splitter"));
const bundle_config_1 = __importDefault(require("../bundle-config"));
const fixturify_project_1 = __importDefault(require("fixturify-project"));
const lodash_1 = require("lodash");
const { module: Qmodule, test } = qunit_1.default;
Qmodule('splitter', function (hooks) {
    let builder;
    let project;
    let pack;
    let splitter;
    hooks.beforeEach(function () {
        project = new fixturify_project_1.default('my-app');
        let alpha = project.addDependency('alpha');
        lodash_1.merge(alpha.files, {
            'index.js': '',
            mod: {
                'index.js': '',
            },
        });
        let beta = project.addDependency('@beta/thing');
        lodash_1.merge(beta.files, {
            'index.js': '',
            mod: {
                'index.js': '',
            },
        });
        project.writeSync();
        pack = new package_1.default(stubAddonInstance(project.baseDir));
        let analyzer = new analyzer_1.default(new broccoli_source_1.UnwatchedDir(project.baseDir), pack);
        splitter = new splitter_1.default({
            bundles: new bundle_config_1.default('thing'),
            analyzers: new Map([[analyzer, pack]]),
        });
        builder = new broccoli_1.default.Builder(analyzer);
    });
    hooks.afterEach(function () {
        if (builder) {
            return builder.cleanup();
        }
        project.dispose();
    });
    let handledDynamicExamples = [
        ["import('alpha');", 'alpha'],
        ["import('@beta/thing');", '@beta/thing'],
        ['import(`alpha`);', 'alpha'],
        ['import(`@beta/thing`);', '@beta/thing'],
        ["import('alpha/mod');", 'alpha/mod'],
        ["import('@beta/thing/mod');", '@beta/thing/mod'],
        ['import(`alpha/mod`);', 'alpha/mod'],
        ['import(`@beta/thing/mod`);', '@beta/thing/mod'],
        ['import(`alpha/${foo}`);', ['alpha/', ''], ['foo']],
        ['import(`alpha/in${foo}`);', ['alpha/in', ''], ['foo']],
        ['import(`@beta/thing/${foo}`);', ['@beta/thing/', ''], ['foo']],
        ['import(`@beta/thing/in${foo}`);', ['@beta/thing/in', ''], ['foo']],
        ['import(`alpha/${foo}/component`);', ['alpha/', '/component'], ['foo']],
        ['import(`@beta/thing/${foo}/component`);', ['@beta/thing/', '/component'], ['foo']],
        ['import(`alpha/${foo}/component/${bar}`);', ['alpha/', '/component/', ''], ['foo', 'bar']],
        ['import(`@beta/thing/${foo}/component/${bar}`);', ['@beta/thing/', '/component/', ''], ['foo', 'bar']],
    ];
    for (let example of handledDynamicExamples) {
        let [src] = example;
        test(`handled dynamic exmaple: ${src}`, function (assert) {
            var _a;
            return __awaiter(this, void 0, void 0, function* () {
                fs_extra_1.outputFileSync(path_1.join(project.baseDir, 'sample.js'), src);
                yield builder.build();
                let deps = yield splitter.deps();
                assert.deepEqual([...deps.keys()], ['app', 'tests']);
                assert.deepEqual((_a = deps.get('app')) === null || _a === void 0 ? void 0 : _a.staticImports, []);
                if (Array.isArray(example[1])) {
                    assert.deepEqual(deps.get('app'), {
                        staticImports: [],
                        dynamicImports: [],
                        dynamicTemplateImports: [
                            {
                                cookedQuasis: [path_1.join(project.baseDir, 'node_modules', example[1][0]), ...example[1].slice(1)],
                                expressionNameHints: example[2],
                                importedBy: [
                                    {
                                        cookedQuasis: example[1],
                                        expressionNameHints: example[2],
                                        path: 'sample.js',
                                        package: pack,
                                        treeType: undefined,
                                    },
                                ],
                            },
                        ],
                    });
                }
                else {
                    assert.deepEqual(deps.get('app'), {
                        staticImports: [],
                        dynamicTemplateImports: [],
                        dynamicImports: [
                            {
                                specifier: example[1],
                                entrypoint: path_1.join(project.baseDir, 'node_modules', example[1], 'index.js'),
                                importedBy: [
                                    {
                                        isDynamic: true,
                                        specifier: example[1],
                                        path: 'sample.js',
                                        package: pack,
                                        treeType: undefined,
                                    },
                                ],
                            },
                        ],
                    });
                }
            });
        });
    }
    let safeURLExamples = [
        "import('http://example.com/')",
        "import('https://example.com/')",
        "import('https://example.com/thing')",
        "import('//example.com/thing')",
        'import(`http://${which}`)',
        'import(`https://${which}`)',
        'import(`//${which}`)',
        'import(`http://${which}/rest`)',
        'import(`https://${which}/rest`)',
        'import(`//${which}/rest`)',
    ];
    for (let src of safeURLExamples) {
        test(`safe url example: ${src}`, function (assert) {
            return __awaiter(this, void 0, void 0, function* () {
                fs_extra_1.outputFileSync(path_1.join(project.baseDir, 'sample.js'), src);
                yield builder.build();
                let deps = yield splitter.deps();
                assert.deepEqual([...deps.keys()], ['app', 'tests']);
                assert.deepEqual(deps.get('app'), {
                    staticImports: [],
                    dynamicImports: [],
                    dynamicTemplateImports: [],
                });
            });
        });
    }
    test('disallowed patttern: partial package', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            assert.expect(1);
            let src = 'import(`lo${dash}`)';
            fs_extra_1.outputFileSync(path_1.join(project.baseDir, 'sample.js'), src);
            yield builder.build();
            try {
                yield splitter.deps();
                throw new Error(`expected not to get here, build was supposed to fail`);
            }
            catch (err) {
                assert.contains(err.message, 'Dynamic imports must target unambiguous package names');
            }
        });
    });
    test('disallowed patttern: partial namespaced package', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            assert.expect(1);
            let src = 'import(`@foo/${dash}`)';
            fs_extra_1.outputFileSync(path_1.join(project.baseDir, 'sample.js'), src);
            yield builder.build();
            try {
                yield splitter.deps();
                throw new Error(`expected not to get here, build was supposed to fail`);
            }
            catch (err) {
                assert.contains(err.message, 'Dynamic imports must target unambiguous package names');
            }
        });
    });
    test('dynamic relative imports are forbidden', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            assert.expect(1);
            let src = "import('./thing')";
            fs_extra_1.outputFileSync(path_1.join(project.baseDir, 'sample.js'), src);
            yield builder.build();
            try {
                yield splitter.deps();
                throw new Error(`expected not to get here, build was supposed to fail`);
            }
            catch (err) {
                assert.contains(err.message, `ember-auto-import does not support dynamic relative imports. "./thing" is relative. To make this work, you need to upgrade to Embroider.`);
            }
        });
    });
    test('dynamic template relative imports are forbidden', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            assert.expect(1);
            let src = 'import(`./thing/${foo}`)';
            fs_extra_1.outputFileSync(path_1.join(project.baseDir, 'sample.js'), src);
            yield builder.build();
            try {
                yield splitter.deps();
                throw new Error(`expected not to get here, build was supposed to fail`);
            }
            catch (err) {
                assert.contains(err.message, `ember-auto-import does not support dynamic relative imports. "./thing/" is relative. To make this work, you need to upgrade to Embroider.`);
            }
        });
    });
});
function stubAddonInstance(baseDir) {
    let project = {
        root: baseDir,
        targets: {},
        ui: {},
        pkg: require(path_1.join(baseDir, 'package.json')),
        addons: [
            {
                name: 'ember-cli-babel',
                pkg: { version: '7.0.0' },
                buildBabelOptions() {
                    return {
                        plugins: [require.resolve('../../babel-plugin')],
                    };
                },
            },
        ],
    };
    let app = {
        env: 'development',
        project,
        options: {},
        addonPostprocessTree: {},
    };
    return {
        name: 'ember-auto-import',
        parent: project,
        project,
        app,
        pkg: { name: 'ember-auto-import', version: '0.0.0' },
        root: '/fake',
        options: {},
        addons: [],
    };
}
//# sourceMappingURL=splitter-test.js.map