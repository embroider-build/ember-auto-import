import QUnit from 'qunit';
import 'qunit-assertions-extra';
import broccoli, { Builder } from 'broccoli';
import { UnwatchedDir } from 'broccoli-source';
import { outputFileSync } from 'fs-extra';
import { join } from 'path';
import Package, { Options } from '../package';
import Analyzer from '../analyzer';
import Splitter from '../splitter';
import BundleConfig from '../bundle-config';
import { Project } from 'scenario-tester';
import { merge } from 'lodash';
import {
  AddonInstance,
  AppInstance,
  Project as EmberCLIProject,
} from '@embroider/shared-internals';
// @ts-ignore
import broccoliBabel from 'broccoli-babel-transpiler';

const { module: Qmodule, test } = QUnit;

Qmodule('splitter', function (hooks) {
  let builder: Builder;
  let project: Project;
  let pack: Package;
  let splitter: Splitter;
  let setup: (options?: Options) => void;

  hooks.beforeEach(function (this: any) {
    project = new Project('my-app', {
      files: {
        lib: {
          'example1.js':
            'export default function() { return "example1 worked" }',
          'example2.js':
            'export default function() { return "example2 worked" }',
          'example3.js':
            'export default function() { return "example3 worked" }',
        },
      },
    });

    let alpha = project.addDependency('alpha');
    merge(alpha.files, {
      'index.js': '',
      mod: {
        'index.js': '',
      },
    });
    let beta = project.addDependency('@beta/thing');
    merge(beta.files, {
      'index.js': '',
      mod: {
        'index.js': '',
      },
    });

    project.addDevDependency('aliasing-example', {
      files: {
        'outside.js': `export default function() {}`,
        dist: {
          'inside.js': `export default function() {}`,
          'index.js': `export default function() {}`,
        },
      },
    });

    project.writeSync();

    setup = function (options: Options = {}) {
      pack = new Package(stubAddonInstance(project.baseDir, options));
      let transpiled = broccoliBabel(new UnwatchedDir(project.baseDir), {
        plugins: [
          require.resolve('../../js/analyzer-plugin'),
          require.resolve('@babel/plugin-syntax-typescript'),

          // keeping this in non-parallelizable form prevents
          // broccoli-babel-transpiler from spinning up separate worker processes,
          // which we don't want or need and which hang at the end of the test
          // suite.
          require('../../babel-plugin'),
        ],
      });
      let analyzer = new Analyzer(transpiled, pack, undefined, true);
      splitter = new Splitter({
        bundles: new BundleConfig({
          vendor: {
            js: 'assets/vendor.js',
            css: 'assetes/vendor.css',
          },
          app: {
            html: 'index.html',
          },
        }),
        analyzers: new Map([[analyzer, pack]]),
      });
      builder = new broccoli.Builder(analyzer);
    };

    setup();
  });

  hooks.afterEach(function (this: any) {
    if (builder) {
      return builder.cleanup();
    }
    project.dispose();
  });

  type Example = [
    string,
    (
      | { specifier: string; packageName: string }
      | { quasis: string[]; expressions: string[]; packageName: string }
    )
  ];

  let handledImportCallExamples: Example[] = [
    ["'alpha'", { specifier: 'alpha', packageName: 'alpha' }],
    ["'@beta/thing'", { specifier: '@beta/thing', packageName: '@beta/thing' }],
    ['`alpha`', { specifier: 'alpha', packageName: 'alpha' }],
    ['`@beta/thing`', { specifier: '@beta/thing', packageName: '@beta/thing' }],
    ["'alpha/mod'", { specifier: 'alpha/mod', packageName: 'alpha' }],
    [
      "'@beta/thing/mod'",
      { specifier: '@beta/thing/mod', packageName: '@beta/thing' },
    ],
    ['`alpha/mod`', { specifier: 'alpha/mod', packageName: 'alpha' }],
    [
      '`@beta/thing/mod`',
      { specifier: '@beta/thing/mod', packageName: '@beta/thing' },
    ],
    [
      '`alpha/${foo}`',
      { quasis: ['alpha/', ''], expressions: ['foo'], packageName: 'alpha' },
    ],
    [
      '`alpha/in${foo}`',
      { quasis: ['alpha/in', ''], expressions: ['foo'], packageName: 'alpha' },
    ],
    [
      '`@beta/thing/${foo}`',
      {
        quasis: ['@beta/thing/', ''],
        expressions: ['foo'],
        packageName: '@beta/thing',
      },
    ],
    [
      '`@beta/thing/in${foo}`',
      {
        quasis: ['@beta/thing/in', ''],
        expressions: ['foo'],
        packageName: '@beta/thing',
      },
    ],
    [
      '`alpha/${foo}/component`',
      {
        quasis: ['alpha/', '/component'],
        expressions: ['foo'],
        packageName: 'alpha',
      },
    ],
    [
      '`@beta/thing/${foo}/component`',
      {
        quasis: ['@beta/thing/', '/component'],
        expressions: ['foo'],
        packageName: '@beta/thing',
      },
    ],
    [
      '`alpha/${foo}/component/${bar}`',
      {
        quasis: ['alpha/', '/component/', ''],
        expressions: ['foo', 'bar'],
        packageName: 'alpha',
      },
    ],
    [
      '`@beta/thing/${foo}/component/${bar}`',
      {
        quasis: ['@beta/thing/', '/component/', ''],
        expressions: ['foo', 'bar'],
        packageName: '@beta/thing',
      },
    ],
  ];

  for (let example of handledImportCallExamples) {
    let [arg] = example;
    test(`handled dynamic example: import(${arg})`, async function (assert) {
      outputFileSync(join(project.baseDir, 'sample.js'), `import(${arg})`);
      await builder.build();
      let deps = await splitter.deps();
      assert.deepEqual([...deps.keys()], ['app', 'tests']);
      assert.deepEqual(deps.get('app')?.staticImports, []);
      assert.deepEqual(deps.get('app')?.staticTemplateImports, []);
      if ('quasis' in example[1]) {
        assert.deepEqual(deps.get('app')?.dynamicImports, []);
        let dynamicTemplateImports = deps.get('app')?.dynamicTemplateImports;
        assert.equal(dynamicTemplateImports?.length, 1);
        assert.deepEqual(
          dynamicTemplateImports?.[0].cookedQuasis,
          example[1].quasis
        );
        assert.deepEqual(
          dynamicTemplateImports?.[0].expressionNameHints,
          example[1].expressions
        );
        assert.equal(
          dynamicTemplateImports?.[0].packageName,
          example[1].packageName
        );
        assert.equal(
          dynamicTemplateImports?.[0].packageRoot,
          join(project.baseDir, 'node_modules', example[1].packageName)
        );
      } else {
        assert.deepEqual(deps.get('app')?.dynamicTemplateImports, []);
        let dynamicImports = deps.get('app')?.dynamicImports;
        assert.equal(dynamicImports?.length, 1);
        assert.equal(dynamicImports?.[0].specifier, example[1].specifier);
        assert.equal(dynamicImports?.[0].packageName, example[1].packageName);
        assert.equal(
          dynamicImports?.[0].packageRoot,
          join(project.baseDir, 'node_modules', example[1].packageName)
        );
      }
    });
  }

  for (let example of handledImportCallExamples) {
    let [arg] = example;
    test(`handled import example: importSync(${arg})`, async function (assert) {
      outputFileSync(
        join(project.baseDir, 'sample.js'),
        `import { importSync } from '@embroider/macros'; importSync(${arg})`
      );
      await builder.build();
      let deps = await splitter.deps();
      assert.deepEqual([...deps.keys()], ['app', 'tests']);
      assert.deepEqual(deps.get('app')?.dynamicImports, []);
      assert.deepEqual(deps.get('app')?.dynamicTemplateImports, []);
      if ('quasis' in example[1]) {
        assert.deepEqual(deps.get('app')?.staticImports, []);
        let staticTemplateImports = deps.get('app')?.staticTemplateImports;
        assert.equal(staticTemplateImports?.length, 1);
        assert.deepEqual(
          staticTemplateImports?.[0].cookedQuasis,
          example[1].quasis
        );
        assert.deepEqual(
          staticTemplateImports?.[0].expressionNameHints,
          example[1].expressions
        );
        assert.equal(
          staticTemplateImports?.[0].packageName,
          example[1].packageName
        );
        assert.equal(
          staticTemplateImports?.[0].packageRoot,
          join(project.baseDir, 'node_modules', example[1].packageName)
        );
      } else {
        assert.deepEqual(deps.get('app')?.staticTemplateImports, []);
        let staticImports = deps.get('app')?.staticImports;
        assert.equal(staticImports?.length, 1);
        assert.equal(staticImports?.[0].specifier, example[1].specifier);
        assert.equal(staticImports?.[0].packageName, example[1].packageName);
        assert.equal(
          staticImports?.[0].packageRoot,
          join(project.baseDir, 'node_modules', example[1].packageName)
        );
      }
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
    'import(`data:application/javascript;base64,ZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24oKSB7IHJldHVybiAxIH0=`)',
    'import(`data:application/javascript;base64,${code}`)',
  ];
  for (let src of safeURLExamples) {
    test(`safe url example: ${src}`, async function (assert) {
      outputFileSync(join(project.baseDir, 'sample.js'), src);
      await builder.build();
      let deps = await splitter.deps();
      assert.deepEqual([...deps.keys()], ['app', 'tests']);
      assert.deepEqual(deps.get('app'), {
        staticImports: [],
        staticTemplateImports: [],
        dynamicImports: [],
        dynamicTemplateImports: [],
      });
    });
  }

  test('disallowed patttern: partial package', async function (assert) {
    assert.expect(1);
    let src = 'import(`lo${dash}`)';
    outputFileSync(join(project.baseDir, 'sample.js'), src);
    await builder.build();
    try {
      await splitter.deps();
      throw new Error(`expected not to get here, build was supposed to fail`);
    } catch (err) {
      assert.contains(
        err.message,
        'Dynamic imports must target unambiguous package names'
      );
    }
  });

  test('disallowed patttern: partial namespaced package', async function (assert) {
    assert.expect(1);
    let src = 'import(`@foo/${dash}`)';
    outputFileSync(join(project.baseDir, 'sample.js'), src);
    await builder.build();
    try {
      await splitter.deps();
      throw new Error(`expected not to get here, build was supposed to fail`);
    } catch (err) {
      assert.contains(
        err.message,
        'Dynamic imports must target unambiguous package names'
      );
    }
  });

  test('dynamic relative imports are forbidden', async function (assert) {
    assert.expect(1);
    let src = "import('./thing')";
    outputFileSync(join(project.baseDir, 'sample.js'), src);
    await builder.build();
    try {
      await splitter.deps();
      throw new Error(`expected not to get here, build was supposed to fail`);
    } catch (err) {
      assert.contains(
        err.message,
        `ember-auto-import does not support dynamic relative imports. "./thing" is relative. To make this work, you need to upgrade to Embroider.`
      );
    }
  });

  test('exact alias remaps package name and root', async function (assert) {
    setup({
      alias: {
        'my-aliased-package$': 'aliasing-example/dist/index.js',
      },
    });

    let src = `import x from 'my-aliased-package';`;
    outputFileSync(join(project.baseDir, 'sample.js'), src);
    await builder.build();
    let deps = await splitter.deps();
    assert.deepEqual(
      deps.get('app')?.staticImports.map((i) => ({
        packageName: i.packageName,
        packageRoot: i.packageRoot,
        specifier: i.specifier,
      })),
      [
        {
          packageName: 'aliasing-example',
          packageRoot: join(
            project.baseDir,
            'node_modules',
            'aliasing-example'
          ),
          specifier: 'my-aliased-package',
        },
      ]
    );
  });

  test('prefix alias remaps package name and root', async function (assert) {
    setup({
      alias: {
        'my-aliased-package': 'aliasing-example/dist',
      },
    });

    let src = `import x from 'my-aliased-package/inside';`;
    outputFileSync(join(project.baseDir, 'sample.js'), src);
    await builder.build();
    let deps = await splitter.deps();
    assert.deepEqual(
      deps.get('app')?.staticImports.map((i) => ({
        packageName: i.packageName,
        packageRoot: i.packageRoot,
        specifier: i.specifier,
      })),
      [
        {
          packageName: 'aliasing-example',
          packageRoot: join(
            project.baseDir,
            'node_modules',
            'aliasing-example'
          ),
          specifier: 'my-aliased-package/inside',
        },
      ]
    );
  });

  test('aliasing within same package leaves packageRoot and packageName unchanged', async function (assert) {
    setup({
      alias: {
        'aliasing-example': 'aliasing-example/dist',
      },
    });

    let src = `import x from 'aliasing-example';`;
    outputFileSync(join(project.baseDir, 'sample.js'), src);
    await builder.build();
    let deps = await splitter.deps();
    assert.deepEqual(
      deps.get('app')?.staticImports.map((i) => ({
        packageName: i.packageName,
        packageRoot: i.packageRoot,
        specifier: i.specifier,
      })),
      [
        {
          packageName: 'aliasing-example',
          packageRoot: join(
            project.baseDir,
            'node_modules',
            'aliasing-example'
          ),
          specifier: 'aliasing-example',
        },
      ]
    );
  });

  test('app imports correcly via app name', async function (assert) {
    setup({
      allowAppImports: ['lib/**'],
    });

    let src = `import example1 from 'my-app/lib/example1';
    import missing from 'my-app/face/missing-import';`;

    outputFileSync(join(project.baseDir, 'sample.js'), src);
    await builder.build();
    let deps = await splitter.deps();

    assert.deepEqual(
      deps.get('app')?.staticImports.map((i) => ({
        specifier: i.specifier,
      })),
      [
        {
          specifier: 'my-app/lib/example1',
        },
      ]
    );
  });

  // when testing this in the scenario tester we found out that the splitter would never be given
  // a relative import because ember-cli-babel uses babel-plugin-module-resolver to rewrite
  // relateive imports to imports with the full app name included. Skipping for now but if people
  // have any issues we can unskip this test and fix it
  QUnit.skip(
    'app imports correctly with a relative import',
    async function (assert) {
      setup({
        allowAppImports: ['lib/**'],
      });

      let src = `import example2 from './lib/example2';`;

      outputFileSync(join(project.baseDir, 'sample.js'), src);
      await builder.build();
      let deps = await splitter.deps();
      assert.deepEqual(
        deps.get('app')?.staticImports.map((i) => ({
          specifier: i.specifier,
        })),
        [
          {
            specifier: 'app-name/lib/example1', // this might need to be adjusted
          },
        ]
      );
    }
  );
});

function stubAddonInstance(
  baseDir: string,
  autoImport: Options
): AddonInstance {
  let project = {
    root: baseDir,
    targets: {},
    ui: {} as any,
    pkg: require(join(baseDir, 'package.json')),
    addons: [
      {
        name: 'ember-cli-babel',
        pkg: { version: '7.0.0' },
        buildBabelOptions() {
          return {
            plugins: [require.resolve('../../babel-plugin')],
          };
        },
      } as any,
    ],
    name() {
      return 'my-project';
    },
    configPath() {
      return join(baseDir, 'config', 'environment');
    },
  } as EmberCLIProject;
  let app = {
    env: 'development',
    project,
    options: {
      autoImport,
    },
    addonPostprocessTree: {} as any,
  } as AppInstance;
  return {
    name: 'ember-auto-import',
    parent: project,
    project,
    app,
    pkg: { name: 'ember-auto-import', version: '0.0.0' },
    root: '/fake',
    options: {},
    addons: [],
    treeGenerator() {
      throw new Error('unimplemnented');
    },
    _super: undefined,
    _findHost() {
      throw new Error('unimplemented');
    },
  } as unknown as AddonInstance;
}
