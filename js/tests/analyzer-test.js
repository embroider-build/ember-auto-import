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
const quick_temp_1 = __importDefault(require("quick-temp"));
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const analyzer_1 = __importDefault(require("../analyzer"));
const { module: Qmodule, test } = qunit_1.default;
Qmodule('analyzer', function (hooks) {
    let builder;
    let upstream;
    let analyzer;
    let pack;
    let babelOptionsWasAccessed = false;
    hooks.beforeEach(function () {
        quick_temp_1.default.makeOrRemake(this, 'workDir', 'auto-import-analyzer-tests');
        fs_extra_1.ensureDirSync((upstream = path_1.join(this.workDir, 'upstream')));
        pack = {
            get babelOptions() {
                babelOptionsWasAccessed = true;
                return {
                    plugins: [require.resolve('../../babel-plugin')],
                };
            },
            babelMajorVersion: 6,
            fileExtensions: ['js'],
        };
        analyzer = new analyzer_1.default(new broccoli_source_1.UnwatchedDir(upstream), pack);
        builder = new broccoli_1.default.Builder(analyzer);
    });
    hooks.afterEach(function () {
        babelOptionsWasAccessed = false;
        fs_extra_1.removeSync(this.workDir);
        if (builder) {
            return builder.cleanup();
        }
    });
    test('babelOptions are accessed only during build', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            assert.notOk(babelOptionsWasAccessed);
            yield builder.build();
            assert.ok(babelOptionsWasAccessed);
        });
    });
    test('initial file passes through', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let original = "import 'some-package';";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), original);
            yield builder.build();
            let content = fs_extra_1.readFileSync(path_1.join(builder.outputPath, 'sample.js'), 'utf8');
            assert.equal(content, original);
        });
    });
    test('created file passes through', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            yield builder.build();
            let original = "import 'some-package';";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), original);
            yield builder.build();
            let content = fs_extra_1.readFileSync(path_1.join(builder.outputPath, 'sample.js'), 'utf8');
            assert.equal(content, original);
        });
    });
    test('updated file passes through', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let original = "import 'some-package';";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), original);
            yield builder.build();
            let updated = "import 'some-package';\nimport 'other-package';";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), updated);
            yield builder.build();
            let content = fs_extra_1.readFileSync(path_1.join(builder.outputPath, 'sample.js'), 'utf8');
            assert.equal(content, updated);
        });
    });
    test('deleted file passes through', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let original = "import 'some-package';";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), original);
            yield builder.build();
            fs_extra_1.removeSync(path_1.join(upstream, 'sample.js'));
            yield builder.build();
            assert.ok(!fs_extra_1.existsSync(path_1.join(builder.outputPath, 'sample.js')), 'should not exist');
        });
    });
    test('imports discovered in created file', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            yield builder.build();
            let original = "import 'some-package';";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), original);
            yield builder.build();
            assert.deepEqual(analyzer.imports, [
                {
                    isDynamic: false,
                    specifier: 'some-package',
                    path: 'sample.js',
                    package: pack,
                    treeType: undefined,
                },
            ]);
        });
    });
    test('imports remain constant in updated file', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let original = "import 'some-package';";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), original);
            yield builder.build();
            let updated = "import 'some-package';\nconsole.log('hi');";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), updated);
            yield builder.build();
            assert.deepEqual(analyzer.imports, [
                {
                    isDynamic: false,
                    specifier: 'some-package',
                    path: 'sample.js',
                    package: pack,
                    treeType: undefined,
                },
            ]);
        });
    });
    test('import added in updated file', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let original = "import 'some-package';";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), original);
            yield builder.build();
            let updated = "import 'some-package';\nimport 'other-package';";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), updated);
            yield builder.build();
            assert.deepEqual(analyzer.imports, [
                {
                    isDynamic: false,
                    specifier: 'some-package',
                    path: 'sample.js',
                    package: pack,
                    treeType: undefined,
                },
                {
                    isDynamic: false,
                    specifier: 'other-package',
                    path: 'sample.js',
                    package: pack,
                    treeType: undefined,
                },
            ]);
        });
    });
    test('import removed in updated file', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let original = "import 'some-package';";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), original);
            yield builder.build();
            let updated = "console.log('x');";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), updated);
            yield builder.build();
            assert.deepEqual(analyzer.imports, []);
        });
    });
    test('import removed when file deleted', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let original = "import 'some-package';";
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), original);
            yield builder.build();
            fs_extra_1.removeSync(path_1.join(upstream, 'sample.js'));
            yield builder.build();
            assert.deepEqual(analyzer.imports, []);
        });
    });
    function isLiteralExample(exp) {
        return exp.length === 2;
    }
    let legalDyamicExamples = [
        ["import('alpha');", 'alpha'],
        ["import('@beta/thing');", '@beta/thing'],
        ['import(`gamma`);', 'gamma'],
        ['import(`@delta/thing`);', '@delta/thing'],
        ["import('epsilon/mod');", 'epsilon/mod'],
        ["import('@zeta/thing/mod');", '@zeta/thing/mod'],
        ['import(`eta/mod`);', 'eta/mod'],
        ['import(`@theta/thing/mod`);', '@theta/thing/mod'],
        ["import('http://example.com');", 'http://example.com'],
        ["import('https://example.com');", 'https://example.com'],
        ["import('//example.com');", '//example.com'],
        ['import(`http://example.com`);', 'http://example.com'],
        ['import(`https://example.com`);', 'https://example.com'],
        ['import(`//example.com`);', '//example.com'],
        ['import(`http://example.com`);', 'http://example.com'],
        ['import(`https://example.com`);', 'https://example.com'],
        ['import(`//example.com`);', '//example.com'],
        ['import(`http://${domain}`);', ['http://', ''], ['domain']],
        ['import(`https://example.com/${path}`);', ['https://example.com/', ''], ['path']],
        ['import(`//${domain}`);', ['//', ''], ['domain']],
        ['import(`alpha/${foo}`);', ['alpha/', ''], ['foo']],
        ['import(`@beta/thing/${foo}`);', ['@beta/thing/', ''], ['foo']],
        ['import(`alpha/${foo}/component`);', ['alpha/', '/component'], ['foo']],
        ['import(`@beta/thing/${foo}/component`);', ['@beta/thing/', '/component'], ['foo']],
        ['import(`alpha/${foo}/component/${bar}`);', ['alpha/', '/component/', ''], ['foo', 'bar']],
        ['import(`@beta/thing/${foo}/component/${bar}`);', ['@beta/thing/', '/component/', ''], ['foo', 'bar']],
    ];
    for (let example of legalDyamicExamples) {
        let [src] = example;
        test(`dynamic import example: ${src}`, function (assert) {
            return __awaiter(this, void 0, void 0, function* () {
                fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), src);
                yield builder.build();
                if (isLiteralExample(example)) {
                    assert.deepEqual(analyzer.imports, [
                        {
                            isDynamic: true,
                            specifier: example[1],
                            path: 'sample.js',
                            package: pack,
                            treeType: undefined,
                        },
                    ]);
                }
                else {
                    assert.deepEqual(analyzer.imports, [
                        {
                            cookedQuasis: example[1],
                            expressionNameHints: example[2],
                            path: 'sample.js',
                            package: pack,
                            treeType: undefined,
                        },
                    ]);
                }
            });
        });
    }
    test('disallowed patttern: unsupported syntax', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            assert.expect(1);
            let src = `
    function x() {
      import((function(){ return 'hi' })());
    }
    `;
            fs_extra_1.outputFileSync(path_1.join(upstream, 'sample.js'), src);
            try {
                yield builder.build();
                throw new Error(`expected not to get here, build was supposed to fail`);
            }
            catch (err) {
                assert.contains(err.message, 'import() is only allowed to contain string literals or template string literals');
            }
        });
    });
});
//# sourceMappingURL=analyzer-test.js.map