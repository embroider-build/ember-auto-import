import QUnit from 'qunit';
import 'qunit-assertions-extra';
import broccoli, { Builder } from 'broccoli';
import { UnwatchedDir } from 'broccoli-source';
import quickTemp from 'quick-temp';
import { ensureDirSync, readFileSync, outputFileSync, removeSync, existsSync } from 'fs-extra';
import { join } from 'path';
import type Package from "../package";
import Analyzer from '../analyzer';
import Splitter from '../splitter';
import BundleConfig from '../bundle-config';
import Project from 'fixturify-project';
import { merge } from 'lodash';

const { module: Qmodule, test } = QUnit;

Qmodule('splitter', function(hooks) {

  let builder: Builder;
  let project: Project;
  let pack: Package;
  let splitter: Splitter;

  hooks.beforeEach(function(this: any) {
    project = new Project('my-app');
    let alpha = project.addDependency('alpha');
    merge(alpha.files, {
      'index.js': '',
      'mod': {
        'index.js': '',
      }
    });
    let beta = project.addDependency('@beta/thing');
    merge(beta.files, {
      'index.js': '',
      'mod': {
        'index.js': ''
      }
    });
    project.writeSync();
    pack = {
      root: project.baseDir,
      aliasFor(a: string){ return a; },
      excludesDependency(name: string) { return name === 'excluded-dependency'; },
      hasDependency(name: string) { return name !== 'not-a-dependency'; },
      isEmberAddonDependency(name: string) { return name === 'an-addon-dependency'; },
      assertAllowedDependency(_: string) { },
      babelOptions: {
        plugins: [require.resolve('../../babel-plugin')]
      },
      babelMajorVersion: 6,
      fileExtensions: ["js"],
    } as Package;
    let analyzer = new Analyzer(new UnwatchedDir(project.baseDir), pack);
    splitter = new Splitter({
      bundles: new BundleConfig('thing' as any),
      analyzers: new Map([[analyzer, pack]])
    });
    builder = new broccoli.Builder(analyzer);
  });

  hooks.afterEach(function(this: any) {
    if (builder) {
      return builder.cleanup();
    }
    project.dispose();
  });

  let handledDynamicExamples = [
    ["import('alpha');", "alpha"],
    ["import('@beta/thing');", "@beta/thing"],
    ["import(`alpha`);", "alpha"],
    ["import(`@beta/thing`);", "@beta/thing"],
    ["import('alpha/mod');", "alpha/mod"],
    ["import('@beta/thing/mod');", "@beta/thing/mod"],
    ["import(`alpha/mod`);", "alpha/mod"],
    ["import(`@beta/thing/mod`);", "@beta/thing/mod"],
    ["import(`alpha/${foo}`);", ["alpha/", ""], ["foo"]],
    ["import(`@beta/thing/${foo}`);", ["@beta/thing/", ""], ["foo"]],
    ["import(`alpha/${foo}/component`);", ["alpha/", "/component"], ["foo"]],
    [
      "import(`@beta/thing/${foo}/component`);",
      ["@beta/thing/", "/component"],
      ["foo"],
    ],
    [
      "import(`alpha/${foo}/component/${bar}`);",
      ["alpha/", "/component/", ""],
      ["foo", "bar"],
    ],
    [
      "import(`@beta/thing/${foo}/component/${bar}`);",
      ["@beta/thing/", "/component/", ""],
      ["foo", "bar"],
    ],
  ];

  for (let example of handledDynamicExamples) {
    let [src] = example;
    test(`handled dynamic exmaple: ${src}`, async function (assert) {
      outputFileSync(join(project.baseDir, "sample.js"), src);
      await builder.build();
      let deps = await splitter.deps();
      assert.deepEqual([...deps.keys()], ["app", "tests"]);
      assert.deepEqual(deps.get("app")?.staticImports, []);
      if (Array.isArray(example[1])) {
        assert.deepEqual(
          ['unimplemented'],
          example[1]
        );
      } else {
        assert.deepEqual(
          deps.get("app")?.dynamicImports.map((i) => i.specifier),
          [example[1]]
        );
      }
    });
  }

  test("disallowed patttern: partial package", async function (assert) {
    assert.expect(1);
    let src = "import(`lo${dash}`)";
    outputFileSync(join(project.baseDir, "sample.js"), src);
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
    outputFileSync(join(project.baseDir, "sample.js"), src);
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
    outputFileSync(join(project.baseDir, "sample.js"), src);
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
    outputFileSync(join(project.baseDir, "sample.js"), src);
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
});
