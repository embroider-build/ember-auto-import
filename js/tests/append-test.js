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
const broccoli_1 = require("broccoli");
const broccoli_source_1 = require("broccoli-source");
const quick_temp_1 = __importDefault(require("quick-temp"));
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const broccoli_append_1 = __importDefault(require("../broccoli-append"));
const { module: Qmodule, test } = qunit_1.default;
Qmodule('broccoli-append', function (hooks) {
    let builder;
    let upstream;
    let appended;
    hooks.beforeEach(function () {
        quick_temp_1.default.makeOrRemake(this, 'workDir', 'auto-import-build-tests');
        fs_extra_1.ensureDirSync((upstream = path_1.join(this.workDir, 'upstream')));
        fs_extra_1.ensureDirSync((appended = path_1.join(this.workDir, 'appended')));
    });
    hooks.afterEach(function () {
        fs_extra_1.removeSync(this.workDir);
        if (builder) {
            return builder.cleanup();
        }
    });
    function makeBuilder(opts) {
        let node = new broccoli_append_1.default(new broccoli_source_1.UnwatchedDir(upstream), new broccoli_source_1.UnwatchedDir(appended), Object.assign({
            mappings: new Map(),
            passthrough: new Map(),
        }, opts));
        return new broccoli_1.Builder(node);
    }
    test('non-matching file created', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            builder = makeBuilder();
            yield builder.build();
            let out = path_1.join(builder.outputPath, 'assets/whatever');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/whatever'), 'hello');
            yield builder.build();
            assert.equal(fs_extra_1.readFileSync(out, 'utf8'), 'hello');
        });
    });
    test('non-matching file updated', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            builder = makeBuilder();
            let out = path_1.join(builder.outputPath, 'assets/whatever');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/whatever'), 'hello');
            yield builder.build();
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/whatever'), 'goodbye');
            yield builder.build();
            assert.equal(fs_extra_1.readFileSync(out, 'utf8'), 'goodbye', 'updated value');
        });
    });
    test('non-matching file deleted', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            builder = makeBuilder();
            let out = path_1.join(builder.outputPath, 'assets/whatever');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/whatever'), 'hello');
            yield builder.build();
            fs_extra_1.removeSync(path_1.join(upstream, 'assets/whatever'));
            yield builder.build();
            assert.ok(!fs_extra_1.existsSync(out), 'removed');
        });
    });
    test('nothing to be appended', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let mappings = new Map();
            let byType = new Map();
            mappings.set('app', byType);
            byType.set('js', 'assets/vendor.js');
            builder = makeBuilder({
                mappings,
            });
            let out = path_1.join(builder.outputPath, 'assets/vendor.js');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/vendor.js'), 'hello');
            fs_extra_1.ensureDirSync(path_1.join(appended, 'app'));
            yield builder.build();
            assert.equal(fs_extra_1.readFileSync(out, 'utf8'), 'hello');
        });
    });
    test('appended dir does not exist', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let mappings = new Map();
            let byType = new Map();
            mappings.set('other', byType);
            byType.set('js', 'assets/vendor.js');
            builder = makeBuilder({
                mappings,
            });
            let out = path_1.join(builder.outputPath, 'assets/vendor.js');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/vendor.js'), 'hello');
            yield builder.build();
            assert.equal(fs_extra_1.readFileSync(out, 'utf8'), 'hello');
        });
    });
    test('nothing to append to', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let mappings = new Map();
            let byType = new Map();
            mappings.set('app', byType);
            byType.set('js', 'assets/vendor.js');
            builder = makeBuilder({
                mappings,
            });
            let out = path_1.join(builder.outputPath, 'assets/vendor.js');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/chunk1.js'), 'from-chunk-one');
            yield builder.build();
            assert.ok(!fs_extra_1.existsSync(out), 'removed');
        });
    });
    test('all files appended', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let mappings = new Map();
            let byType = new Map();
            mappings.set('app', byType);
            byType.set('js', 'assets/vendor.js');
            byType.set('css', 'assets/vendor.css');
            builder = makeBuilder({
                mappings,
            });
            let outJs = path_1.join(builder.outputPath, 'assets/vendor.js');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/vendor.js'), 'hello');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/1.js'), 'one');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/2.js'), 'two');
            fs_extra_1.outputFileSync(path_1.join(appended, 'tests/3.js'), 'three');
            let outCss = path_1.join(builder.outputPath, 'assets/vendor.css');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/vendor.css'), 'hola');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/1.css'), 'uno');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/2.css'), 'dos');
            fs_extra_1.outputFileSync(path_1.join(appended, 'tests/3.css'), 'tres');
            yield builder.build();
            let content = fs_extra_1.readFileSync(outJs, 'utf8');
            assert.ok(/^hello;\n/.test(content), 'original vendor.js and separator');
            assert.ok(/\bone\b/.test(content), 'found one');
            assert.ok(/\btwo\b/.test(content), 'found two');
            assert.ok(!/\bthree\b/.test(content), 'did not find three');
            assert.ok(!/\buno\b/.test(content), 'did not find CSS');
            content = fs_extra_1.readFileSync(outCss, 'utf8');
            assert.ok(/^hola\n/.test(content), 'original vendor.css and separator');
            assert.ok(/\buno\b/.test(content), 'found uno');
            assert.ok(/\bdos\b/.test(content), 'found dos');
            assert.ok(!/\btres\b/.test(content), 'did not find tres');
            assert.ok(!/\bone\b/.test(content), 'did not find JS');
        });
    });
    test('moves trailing sourceMappingURL', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let mappings = new Map();
            let byType = new Map();
            mappings.set('app', byType);
            byType.set('js', 'assets/vendor.js');
            builder = makeBuilder({
                mappings,
            });
            let out = path_1.join(builder.outputPath, 'assets/vendor.js');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/vendor.js'), "function(){ console.log('hi'); } //# sourceMappingURL=vendor.map \n");
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/1.js'), 'one');
            yield builder.build();
            let content = fs_extra_1.readFileSync(out, 'utf8');
            assert.equal(content, "function(){ console.log('hi'); } ;\none//# sourceMappingURL=vendor.map \n");
        });
    });
    test('does not match non-trailing sourceMappingURL', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let mappings = new Map();
            let byType = new Map();
            mappings.set('app', byType);
            byType.set('js', 'assets/vendor.js');
            builder = makeBuilder({
                mappings,
            });
            let out = path_1.join(builder.outputPath, 'assets/vendor.js');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/vendor.js'), "function(){ console.log('hi'); } //# sourceMappingURL=vendor.map \nfunction(){ console.log('bye'); }");
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/1.js'), 'one');
            yield builder.build();
            let content = fs_extra_1.readFileSync(out, 'utf8');
            assert.equal(content, "function(){ console.log('hi'); } //# sourceMappingURL=vendor.map \nfunction(){ console.log('bye'); };\none");
        });
    });
    test('upstream changed', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let mappings = new Map();
            let byType = new Map();
            mappings.set('app', byType);
            byType.set('js', 'assets/vendor.js');
            byType.set('css', 'assets/vendor.css');
            builder = makeBuilder({
                mappings,
            });
            let outJs = path_1.join(builder.outputPath, 'assets/vendor.js');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/vendor.js'), 'hello');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/1.js'), 'one');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/2.js'), 'two');
            let outCss = path_1.join(builder.outputPath, 'assets/vendor.css');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/vendor.css'), 'hola');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/1.css'), 'uno');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/2.css'), 'dos');
            yield builder.build();
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/vendor.js'), 'bonjour');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/vendor.css'), 'gutentag');
            yield builder.build();
            let content = fs_extra_1.readFileSync(outJs, 'utf8');
            assert.ok(/^bonjour;\n/.test(content), 'original vendor.js and separator');
            assert.ok(/\bone\b/.test(content), 'found one');
            assert.ok(/\btwo\b/.test(content), 'found two');
            assert.ok(!/\buno\b/.test(content), 'did not find CSS');
            content = fs_extra_1.readFileSync(outCss, 'utf8');
            assert.ok(/^gutentag\n/.test(content), 'original vendor.css and separator');
            assert.ok(/\buno\b/.test(content), 'found uno');
            assert.ok(/\bdos\b/.test(content), 'found dos');
            assert.ok(!/\bone\b/.test(content), 'did not find JS');
        });
    });
    test('inner appended changed', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let mappings = new Map();
            let byType = new Map();
            mappings.set('app/inner', byType);
            byType.set('js', 'assets/vendor.js');
            builder = makeBuilder({
                mappings,
            });
            let out = path_1.join(builder.outputPath, 'assets/vendor.js');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/vendor.js'), 'hello');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/inner/1.js'), 'one');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/inner/2.js'), 'two');
            yield builder.build();
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/inner/1.js'), 'updated');
            yield builder.build();
            let content = fs_extra_1.readFileSync(out, 'utf8');
            assert.ok(/^hello;\n/.test(content), 'original vendor.js and separator');
            assert.ok(/\bupdated\b/.test(content), 'found updated');
            assert.ok(/\btwo\b/.test(content), 'found two');
        });
    });
    test('appended changed', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let mappings = new Map();
            let byType = new Map();
            mappings.set('app', byType);
            byType.set('js', 'assets/vendor.js');
            byType.set('css', 'assets/vendor.css');
            builder = makeBuilder({
                mappings,
            });
            let outJs = path_1.join(builder.outputPath, 'assets/vendor.js');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/vendor.js'), 'hello');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/1.js'), 'one');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/2.js'), 'two');
            let outCss = path_1.join(builder.outputPath, 'assets/vendor.css');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/vendor.css'), 'hola');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/1.css'), 'uno');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/2.css'), 'dos');
            yield builder.build();
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/1.js'), 'updated');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/1.css'), 'modified');
            yield builder.build();
            let content = fs_extra_1.readFileSync(outJs, 'utf8');
            assert.ok(/^hello;\n/.test(content), 'original vendor.js and separator');
            assert.ok(/\bupdated\b/.test(content), 'found updated');
            assert.ok(/\btwo\b/.test(content), 'found two');
            content = fs_extra_1.readFileSync(outCss, 'utf8');
            assert.ok(/^hola\n/.test(content), 'original vendor.css and separator');
            assert.ok(/\bmodified\b/.test(content), 'found modified');
            assert.ok(/\bdos\b/.test(content), 'found dos');
        });
    });
    test('upstream and appended changed', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let mappings = new Map();
            let byType = new Map();
            mappings.set('app', byType);
            byType.set('js', 'assets/vendor.js');
            byType.set('css', 'assets/vendor.css');
            builder = makeBuilder({
                mappings,
            });
            let outJs = path_1.join(builder.outputPath, 'assets/vendor.js');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/vendor.js'), 'hello');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/1.js'), 'one');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/2.js'), 'two');
            let outCss = path_1.join(builder.outputPath, 'assets/vendor.css');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/vendor.css'), 'hola');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/1.css'), 'uno');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/2.css'), 'dos');
            yield builder.build();
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/vendor.js'), 'bonjour');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/1.js'), 'updated');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/vendor.css'), 'guten tag');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/1.css'), 'modified');
            yield builder.build();
            let content = fs_extra_1.readFileSync(outJs, 'utf8');
            assert.ok(/^bonjour;\n/.test(content), 'original vendor.js and separator');
            assert.ok(/\bupdated\b/.test(content), 'found updated');
            assert.ok(/\btwo\b/.test(content), 'found two');
            content = fs_extra_1.readFileSync(outCss, 'utf8');
            assert.ok(/^guten tag\n/.test(content), 'original vendor.css and separator');
            assert.ok(/\bmodified\b/.test(content), 'found modified');
            assert.ok(/\bdos\b/.test(content), 'found dos');
        });
    });
    test('additional appended file', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let mappings = new Map();
            let byType = new Map();
            mappings.set('app', byType);
            byType.set('js', 'assets/vendor.js');
            byType.set('css', 'assets/vendor.css');
            builder = makeBuilder({
                mappings,
            });
            let outJs = path_1.join(builder.outputPath, 'assets/vendor.js');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/vendor.js'), 'hello');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/1.js'), 'one');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/2.js'), 'two');
            let outCss = path_1.join(builder.outputPath, 'assets/vendor.css');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/vendor.css'), 'hola');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/1.css'), 'uno');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/2.css'), 'dos');
            yield builder.build();
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/3.js'), 'three');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/3.css'), 'tres');
            yield builder.build();
            let content = fs_extra_1.readFileSync(outJs, 'utf8');
            assert.ok(/^hello;\n/.test(content), 'original vendor.js and separator');
            assert.ok(/\bone\b/.test(content), 'found uno');
            assert.ok(/\btwo\b/.test(content), 'found two');
            assert.ok(/\bthree\b/.test(content), 'found three');
            content = fs_extra_1.readFileSync(outCss, 'utf8');
            assert.ok(/^hola\n/.test(content), 'original vendor.css and separator');
            assert.ok(/\buno\b/.test(content), 'found uno');
            assert.ok(/\bdos\b/.test(content), 'found dos');
            assert.ok(/\btres\b/.test(content), 'found tres');
        });
    });
    test('removed appended file', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let mappings = new Map();
            let byType = new Map();
            mappings.set('app', byType);
            byType.set('js', 'assets/vendor.js');
            byType.set('css', 'assets/vendor.css');
            builder = makeBuilder({
                mappings,
            });
            let outJs = path_1.join(builder.outputPath, 'assets/vendor.js');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/vendor.js'), 'hello');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/1.js'), 'one');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/2.js'), 'two');
            let outCss = path_1.join(builder.outputPath, 'assets/vendor.css');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/vendor.css'), 'hola');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/1.css'), 'uno');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/2.css'), 'dos');
            yield builder.build();
            fs_extra_1.removeSync(path_1.join(appended, 'app/1.js'));
            fs_extra_1.removeSync(path_1.join(appended, 'app/1.css'));
            yield builder.build();
            let content = fs_extra_1.readFileSync(outJs, 'utf8');
            assert.ok(/^hello;\n/.test(content), 'original vendor.js and separator');
            assert.ok(!/\bone\b/.test(content), 'did not find one');
            assert.ok(/\btwo\b/.test(content), 'found two');
            content = fs_extra_1.readFileSync(outCss, 'utf8');
            assert.ok(/^hola\n/.test(content), 'original vendor.css and separator');
            assert.ok(!/\buno\b/.test(content), 'did not find uno');
            assert.ok(/\bdos\b/.test(content), 'found dos');
        });
    });
    test('removed upstream file', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let mappings = new Map();
            let byType = new Map();
            mappings.set('app', byType);
            byType.set('js', 'assets/vendor.js');
            byType.set('css', 'assets/vendor.css');
            builder = makeBuilder({
                mappings,
            });
            let outJs = path_1.join(builder.outputPath, 'assets/vendor.js');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/vendor.js'), 'hello');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/1.js'), 'one');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/2.js'), 'two');
            let outCss = path_1.join(builder.outputPath, 'assets/vendor.css');
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/vendor.css'), 'hola');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/1.css'), 'uno');
            fs_extra_1.outputFileSync(path_1.join(appended, 'app/2.css'), 'dos');
            yield builder.build();
            fs_extra_1.removeSync(path_1.join(upstream, 'assets/vendor.js'));
            fs_extra_1.removeSync(path_1.join(upstream, 'assets/vendor.css'));
            yield builder.build();
            assert.ok(!fs_extra_1.existsSync(outJs), 'removed js');
            assert.ok(!fs_extra_1.existsSync(outCss), 'removed css');
        });
    });
    test('passthrough file created', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let passthrough = new Map();
            passthrough.set('lazy', 'assets');
            builder = makeBuilder({
                passthrough,
            });
            let out = path_1.join(builder.outputPath, 'assets/1.js');
            yield builder.build();
            fs_extra_1.outputFileSync(path_1.join(appended, 'lazy/1.js'), 'one');
            yield builder.build();
            assert.equal(fs_extra_1.readFileSync(out, 'utf8'), 'one');
        });
    });
    test('passthrough file updated', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let passthrough = new Map();
            passthrough.set('lazy', 'assets');
            builder = makeBuilder({
                passthrough,
            });
            let out = path_1.join(builder.outputPath, 'assets/1.js');
            fs_extra_1.outputFileSync(path_1.join(appended, 'lazy/1.js'), 'one');
            yield builder.build();
            fs_extra_1.outputFileSync(path_1.join(appended, 'lazy/1.js'), 'updated');
            yield builder.build();
            assert.equal(fs_extra_1.readFileSync(out, 'utf8'), 'updated');
        });
    });
    test('inner passthrough file updated', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let passthrough = new Map();
            passthrough.set('lazy/inner', 'assets');
            builder = makeBuilder({
                passthrough,
            });
            let out = path_1.join(builder.outputPath, 'assets/1.js');
            fs_extra_1.outputFileSync(path_1.join(appended, 'lazy/inner/1.js'), 'one');
            yield builder.build();
            fs_extra_1.outputFileSync(path_1.join(appended, 'lazy/inner/1.js'), 'updated');
            yield builder.build();
            assert.equal(fs_extra_1.readFileSync(out, 'utf8'), 'updated');
        });
    });
    test('passthrough file deleted', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let passthrough = new Map();
            passthrough.set('lazy', 'assets');
            builder = makeBuilder({
                passthrough,
            });
            let out = path_1.join(builder.outputPath, 'assets/1.js');
            fs_extra_1.outputFileSync(path_1.join(appended, 'lazy/1.js'), 'one');
            yield builder.build();
            fs_extra_1.removeSync(path_1.join(appended, 'lazy/1.js'));
            yield builder.build();
            assert.ok(!fs_extra_1.existsSync(out), 'removed');
        });
    });
    test('appended and passthrough target same directory', function (assert) {
        return __awaiter(this, void 0, void 0, function* () {
            let passthrough = new Map();
            passthrough.set('lazy', 'assets');
            let mappings = new Map();
            let byType = new Map();
            mappings.set('app', byType);
            byType.set('js', 'assets');
            builder = makeBuilder({
                mappings,
                passthrough,
            });
            fs_extra_1.outputFileSync(path_1.join(upstream, 'assets/vendor.js'), 'hello');
            fs_extra_1.outputFileSync(path_1.join(appended, 'lazy/1.js'), 'one');
            yield builder.build();
            assert.ok(fs_extra_1.existsSync(path_1.join(builder.outputPath, 'assets/vendor.js')), 'vendor.js');
            assert.ok(fs_extra_1.existsSync(path_1.join(builder.outputPath, 'assets/1.js')), '1.js');
        });
    });
});
//# sourceMappingURL=append-test.js.map