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
import { Project } from 'fixturify-project';
import { merge } from 'lodash';
import { AddonInstance, AppInstance, Project as EmberCLIProject } from '../ember-cli-models';

const { module: Qmodule, test } = QUnit;

Qmodule('splitter', function (hooks) {
  let builder: Builder;
  let project: Project;
  let pack: Package;
  let splitter: Splitter;
  let setup: (options?: Options) => void;

  hooks.beforeEach(function (this: any) {
    project = new Project('my-app');
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

    project.addDevDependency('my-original-package', {
      files: {
        'index.js': `export default function() {}`,
      },
    });

    project.addDevDependency('prefix-aliasing-example', {
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
      let analyzer = new Analyzer(new UnwatchedDir(project.baseDir), pack);
      splitter = new Splitter({
        bundles: new BundleConfig('thing' as any),
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
    test(`handled dynamic exmaple: ${src}`, async function (assert) {
      outputFileSync(join(project.baseDir, 'sample.js'), src);
      await builder.build();
      let deps = await splitter.deps();
      assert.deepEqual([...deps.keys()], ['app', 'tests']);
      assert.deepEqual(deps.get('app')?.staticImports, []);
      if (Array.isArray(example[1])) {
        assert.deepEqual(deps.get('app'), {
          staticImports: [],
          dynamicImports: [],
          dynamicTemplateImports: [
            {
              cookedQuasis: [join(project.baseDir, 'node_modules', example[1][0]), ...example[1].slice(1)],
              expressionNameHints: example[2] as string[],
              importedBy: [
                {
                  cookedQuasis: example[1],
                  expressionNameHints: example[2] as string[],
                  path: 'sample.js',
                  package: pack,
                  treeType: undefined,
                },
              ],
            },
          ],
        });
      } else {
        assert.deepEqual(deps.get('app'), {
          staticImports: [],
          dynamicTemplateImports: [],
          dynamicImports: [
            {
              specifier: example[1],
              entrypoint: join(project.baseDir, 'node_modules', example[1], 'index.js'),
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
      assert.contains(err.message, 'Dynamic imports must target unambiguous package names');
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
      assert.contains(err.message, 'Dynamic imports must target unambiguous package names');
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

  test('dynamic template relative imports are forbidden', async function (assert) {
    assert.expect(1);
    let src = 'import(`./thing/${foo}`)';
    outputFileSync(join(project.baseDir, 'sample.js'), src);
    await builder.build();
    try {
      await splitter.deps();
      throw new Error(`expected not to get here, build was supposed to fail`);
    } catch (err) {
      assert.contains(
        err.message,
        `ember-auto-import does not support dynamic relative imports. "./thing/" is relative. To make this work, you need to upgrade to Embroider.`
      );
    }
  });

  test('exact alias remaps package name', async function (assert) {
    setup({
      alias: {
        'my-aliased-package': 'my-original-package',
      },
    });

    let src = `import x from 'my-aliased-package';`;
    outputFileSync(join(project.baseDir, 'sample.js'), src);
    await builder.build();
    let deps = await splitter.deps();
    assert.deepEqual(
      deps.get('app')?.staticImports[0].entrypoint,
      join(project.baseDir, 'node_modules', 'my-original-package', 'index.js')
    );
  });

  test('exact alias matches an inner file', async function (assert) {
    setup({
      alias: {
        'prefix-aliasing-example': 'prefix-aliasing-example/dist/index.js',
      },
    });

    let src = `import x from 'prefix-aliasing-example';`;
    outputFileSync(join(project.baseDir, 'sample.js'), src);
    await builder.build();
    let deps = await splitter.deps();
    assert.deepEqual(
      deps.get('app')?.staticImports[0].entrypoint,
      join(project.baseDir, 'node_modules', 'prefix-aliasing-example', 'dist', 'index.js')
    );
  });

  test('non-exact alias does not match', async function (assert) {
    setup({
      alias: {
        'prefix-aliasing-example': 'prefix-aliasing-example/dist/index.js',
      },
    });

    let src = `import x from 'prefix-aliasing-example/outside';`;
    outputFileSync(join(project.baseDir, 'sample.js'), src);
    await builder.build();
    let deps = await splitter.deps();
    assert.deepEqual(
      deps.get('app')?.staticImports[0].entrypoint,
      join(project.baseDir, 'node_modules', 'prefix-aliasing-example', 'outside.js')
    );
  });

  test('webpack alias matches interior paths', async function (assert) {
    setup({
      aliasMode: 'webpack',
      alias: {
        'prefix-aliasing-example': 'prefix-aliasing-example/dist',
      },
    });

    let src = `import x from 'prefix-aliasing-example/inside';`;
    outputFileSync(join(project.baseDir, 'sample.js'), src);
    await builder.build();
    let deps = await splitter.deps();
    assert.deepEqual(
      deps.get('app')?.staticImports[0].entrypoint,
      join(project.baseDir, 'node_modules', 'prefix-aliasing-example', 'dist', 'inside.js')
    );
  });

  test('webpack alias matches index', async function (assert) {
    setup({
      aliasMode: 'webpack',
      alias: {
        'prefix-aliasing-example': 'prefix-aliasing-example/dist',
      },
    });

    let src = `import x from 'prefix-aliasing-example';`;
    outputFileSync(join(project.baseDir, 'sample.js'), src);
    await builder.build();
    let deps = await splitter.deps();
    assert.deepEqual(
      deps.get('app')?.staticImports[0].entrypoint,
      join(project.baseDir, 'node_modules', 'prefix-aliasing-example', 'dist', 'index.js')
    );
  });

  test('webpack alias exact match hits', async function (assert) {
    setup({
      aliasMode: 'webpack',
      alias: {
        'prefix-aliasing-example$': 'prefix-aliasing-example/dist',
      },
    });

    let src = `import x from 'prefix-aliasing-example';`;
    outputFileSync(join(project.baseDir, 'sample.js'), src);
    await builder.build();
    let deps = await splitter.deps();
    assert.deepEqual(
      deps.get('app')?.staticImports[0].entrypoint,
      join(project.baseDir, 'node_modules', 'prefix-aliasing-example', 'dist', 'index.js')
    );
  });

  test('webpack alias exact match misses non-exact import', async function (assert) {
    setup({
      aliasMode: 'webpack',
      alias: {
        'prefix-aliasing-example$': 'prefix-aliasing-example/dist',
      },
    });

    let src = `import x from 'prefix-aliasing-example/outside';`;
    outputFileSync(join(project.baseDir, 'sample.js'), src);
    await builder.build();
    let deps = await splitter.deps();
    assert.deepEqual(
      deps.get('app')?.staticImports[0].entrypoint,
      join(project.baseDir, 'node_modules', 'prefix-aliasing-example', 'outside.js')
    );
  });
});

function stubAddonInstance(baseDir: string, autoImport: Options): AddonInstance {
  let project: EmberCLIProject = {
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
  };
  let app: AppInstance = {
    env: 'development',
    project,
    options: {
      autoImport,
    },
    addonPostprocessTree: {} as any,
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
