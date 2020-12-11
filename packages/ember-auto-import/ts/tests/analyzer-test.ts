import QUnit from 'qunit';
import 'qunit-assertions-extra';
import broccoli, { Builder } from 'broccoli';
import { UnwatchedDir } from 'broccoli-source';
import quickTemp from 'quick-temp';
import { ensureDirSync, readFileSync, outputFileSync, removeSync, existsSync } from 'fs-extra';
import { join } from 'path';
import type Package from "../package";
import Analyzer from '../analyzer';

const { module: Qmodule, test } = QUnit;

Qmodule('analyzer', function(hooks) {

  let builder: Builder;
  let upstream: string;
  let analyzer: Analyzer;
  let pack: Package;
  let babelOptionsWasAccessed = false;

  hooks.beforeEach(function(this: any) {
    quickTemp.makeOrRemake(this, 'workDir', 'auto-import-analyzer-tests');
    ensureDirSync(upstream = join(this.workDir, 'upstream'));
    pack = {
      get babelOptions() {
        babelOptionsWasAccessed = true;
        return {
          plugins: [require.resolve('../../babel-plugin')]
        };
      },
      babelMajorVersion: 6,
      fileExtensions: ["js"],
    } as Package;
    analyzer = new Analyzer(new UnwatchedDir(upstream), pack);
    builder = new broccoli.Builder(analyzer);
  });

  hooks.afterEach(function(this: any) {
    babelOptionsWasAccessed = false;
    removeSync(this.workDir);
    if (builder) {
      return builder.cleanup();
    }
  });

  test('babelOptions are accessed only during build', async function(assert) {
    assert.notOk(babelOptionsWasAccessed);
    await builder.build();
    assert.ok(babelOptionsWasAccessed);
  });

  test('initial file passes through', async function(assert) {
    let original = "import 'some-package';";
    outputFileSync(join(upstream, 'sample.js'), original);
    await builder.build();
    let content = readFileSync(join(builder.outputPath, 'sample.js'), 'utf8');
    assert.equal(content, original);
  });

  test('created file passes through', async function(assert) {
    await builder.build();
    let original = "import 'some-package';";
    outputFileSync(join(upstream, 'sample.js'), original);
    await builder.build();
    let content = readFileSync(join(builder.outputPath, 'sample.js'), 'utf8');
    assert.equal(content, original);
  });

  test('updated file passes through', async function(assert) {
    let original = "import 'some-package';";
    outputFileSync(join(upstream, 'sample.js'), original);
    await builder.build();

    let updated = "import 'some-package';\nimport 'other-package';";
    outputFileSync(join(upstream, 'sample.js'), updated);
    await builder.build();

    let content = readFileSync(join(builder.outputPath, 'sample.js'), 'utf8');
    assert.equal(content, updated);
  });

  test('deleted file passes through', async function(assert) {
    let original = "import 'some-package';";
    outputFileSync(join(upstream, 'sample.js'), original);
    await builder.build();

    removeSync(join(upstream, 'sample.js'));
    await builder.build();

    assert.ok(!existsSync(join(builder.outputPath, 'sample.js')), 'should not exist');
  });

  test('imports discovered in created file', async function(assert) {
    await builder.build();
    let original = "import 'some-package';";
    outputFileSync(join(upstream, 'sample.js'), original);
    await builder.build();
    assert.deepEqual(analyzer.imports, [{
      isDynamic: false,
      specifier: 'some-package',
      path: 'sample.js',
      package: pack,
      treeType: undefined,
    }]);
  });

  test('imports remain constant in updated file', async function(assert) {
    let original = "import 'some-package';";
    outputFileSync(join(upstream, 'sample.js'), original);
    await builder.build();

    let updated = "import 'some-package';\nconsole.log('hi');";
    outputFileSync(join(upstream, 'sample.js'), updated);
    await builder.build();

    assert.deepEqual(analyzer.imports, [{
      isDynamic: false,
      specifier: 'some-package',
      path: 'sample.js',
      package: pack,
      treeType: undefined,
    }]);
  });

  test('import added in updated file', async function(assert) {
    let original = "import 'some-package';";
    outputFileSync(join(upstream, 'sample.js'), original);
    await builder.build();

    let updated = "import 'some-package';\nimport 'other-package';";
    outputFileSync(join(upstream, 'sample.js'), updated);
    await builder.build();

    assert.deepEqual(analyzer.imports, [{
      isDynamic: false,
      specifier: 'some-package',
      path: 'sample.js',
      package: pack,
      treeType: undefined,
    },{
      isDynamic: false,
      specifier: 'other-package',
      path: 'sample.js',
      package: pack,
      treeType: undefined,
    }]);
  });

  test('import removed in updated file', async function(assert) {
    let original = "import 'some-package';";
    outputFileSync(join(upstream, 'sample.js'), original);
    await builder.build();

    let updated = "console.log('x');";
    outputFileSync(join(upstream, 'sample.js'), updated);
    await builder.build();

    assert.deepEqual(analyzer.imports, []);
  });

  test('import removed when file deleted', async function(assert) {
    let original = "import 'some-package';";
    outputFileSync(join(upstream, 'sample.js'), original);
    await builder.build();

    removeSync(join(upstream, 'sample.js'));
    await builder.build();

    assert.deepEqual(analyzer.imports, []);
  });

  // NEXT: rework these into separate tests

  test("allowed dynamic imports are detected", async function (assert) {
    let src = [
      "import('alpha');",
      "import('@beta/thing');",
      "import(`gamma`);",
      "import(`@delta/thing`);",
      "import('epsilon/mod');",
      "import('@zeta/thing/mod');",
      "import(`eta/mod`);",
      "import(`@theta/thing/mod`);",
    ].join("\n");
    outputFileSync(join(upstream, "sample.js"), src);
    await builder.build();
    assert.deepEqual(
      analyzer.imports,
      [
        "alpha",
        "@beta/thing",
        "gamma",
        "@delta/thing",
        "epsilon/mod",
        "@zeta/thing/mod",
        "eta/mod",
        "@theta/thing/mod",
      ].map((e) => ({
        isDynamic: true,
        specifier: e,
        path: "sample.js",
        package: pack,
        treeType: undefined,
      }))
    );
  });

  test("unambigous URL dynamic imports are tolerated", async function (assert) {
    let src = [
      "import('http://example.com');",
      "import('https://example.com');",
      "import('//example.com');",
      "import(`http://example.com`);",
      "import(`https://example.com`);",
      "import(`//example.com`);",
      "import(`http://example.com`);",
      "import(`https://example.com`);",
      "import(`//example.com`);",
      "import(`http://${domain}`);",
      "import(`https://example.com/${path}`);",
      "import(`//${domain}`);",
    ].join("\n");
    outputFileSync(join(upstream, "sample.js"), src);
    await builder.build();

    // FIXME: the analyzer just detects whats present, it's not supposed to
    // ignore these, that can come in the splitter
    assert.deepEqual(analyzer.imports, []);
  });

  test("disallowed patttern: unsupported syntax", async function (assert) {
    assert.expect(1);
    let src = `
    function x() {
      import((function(){ return 'hi' })());
    }
    `;
    outputFileSync(join(upstream, "sample.js"), src);
    try {
      await builder.build();
      throw new Error(`expected not to get here, build was supposed to fail`);
    } catch (err) {
      assert.contains(
        err.message,
        "import() is only allowed to contain string literals or template string literals"
      );
    }
  });

  test("disallowed patttern: partial package", async function (assert) {
    assert.expect(1);
    let src = "import(`lo${dash}`)";
    outputFileSync(join(upstream, "sample.js"), src);
    try {
      await builder.build();
      throw new Error(`expected not to get here, build was supposed to fail`);
    } catch (err) {
      assert.contains(
        err.message,
        "Dynamic imports must target unambiguous package names"
      );
    }
  });

  test("disallowed patttern: partial namespaced package", async function (assert) {
    assert.expect(1);
    let src = "import(`@foo/lo${dash}`)";
    outputFileSync(join(upstream, "sample.js"), src);
    try {
      await builder.build();
      throw new Error(`expected not to get here, build was supposed to fail`);
    } catch (err) {
      assert.contains(
        err.message,
        "Dynamic imports must target unambiguous package names"
      );
    }
  });

  test("dynamic relative imports are forbidden", async function (assert) {
    assert.expect(1);
    let src = "import('./thing')";
    outputFileSync(join(upstream, "sample.js"), src);
    try {
      await builder.build();
      throw new Error(`expected not to get here, build was supposed to fail`);
    } catch (err) {
      assert.contains(
        err.message,
        "ember-auto-import does not support dynamic relative imports. To make this work, you need to upgrade to Embroider."
      );
    }
  });

  test("dynamic template relative imports are forbidden", async function (assert) {
    assert.expect(1);
    let src = "import(`./thing/${foo}`)";
    outputFileSync(join(upstream, "sample.js"), src);
    try {
      await builder.build();
      throw new Error(`expected not to get here, build was supposed to fail`);
    } catch (err) {
      // fixme: this may belong in the splitter and not the analyzer
      assert.contains(
        err.message,
        "ember-auto-import does not support dynamic relative imports. To make this work, you need to upgrade to Embroider."
      );
    }
  });

  test("allowed template dynamic imports are detected", async function (assert) {
    let src = [
      "import(`alpha/${foo}`);",
      "import(`@beta/thing/${foo}`);",
      "import(`alpha/${foo}/component`);",
      "import(`@beta/thing/${foo}/component`);",
      "import(`alpha/${foo}/component/${bar}`);",
      "import(`@beta/thing/${foo}/component/${bar}`);",
    ].join("\n");
    outputFileSync(join(upstream, "sample.js"), src);
    await builder.build();
    assert.deepEqual(
      analyzer.imports,
      [
        {
          q: ["alpha/"],
          e: ["foo"],
        },
        {
          q: ["@beta/thing/"],
          e: ["foo"],
        },
        {
          q: ["alpha/", "component"],
          e: ["foo"],
        },
        {
          q: ["@beta/thing/", "component"],
          e: ["foo"],
        },
        {
          q: ["alpha/", "component"],
          e: ["foo", "bar"],
        },
        {
          q: ["@beta/thing/", "component"],
          e: ["foo", "bar"],
        },
      ].map((e) => ({
        isDynamic: true as true,
        cookedQuasis: e.q,
        expressionNameHints: e.e,
        path: "sample.js",
        package: pack,
        treeType: undefined,
      }))
    );
  });

});
