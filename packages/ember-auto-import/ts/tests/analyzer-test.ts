import QUnit from 'qunit';
import 'qunit-assertions-extra';
import broccoli, { Builder } from 'broccoli';
import { UnwatchedDir } from 'broccoli-source';
import quickTemp from 'quick-temp';
import {
  ensureDirSync,
  readFileSync,
  outputFileSync,
  removeSync,
  existsSync,
} from 'fs-extra';
import { join } from 'path';
import type Package from '../package';
import Analyzer from '../analyzer';
// @ts-ignore
import broccoliBabel from 'broccoli-babel-transpiler';
import type { TransformOptions } from '@babel/core';
import {
  deserialize,
  ImportSyntax,
  serialize,
  MARKER,
} from '../analyzer-syntax';
import { ReadStream } from 'fs';

const { module: Qmodule, test } = QUnit;

Qmodule('analyzer', function (hooks) {
  let builder: Builder;
  let upstream: string;
  let analyzer: Analyzer;
  let pack: Package;
  let babelConfig: TransformOptions;

  hooks.beforeEach(function (this: any) {
    quickTemp.makeOrRemake(this, 'workDir', 'auto-import-analyzer-tests');
    ensureDirSync((upstream = join(this.workDir, 'upstream')));
    pack = {
      fileExtensions: ['js'],
    } as Package;
    babelConfig = {
      plugins: [
        require.resolve('../../js/analyzer-plugin'),
        require.resolve('@babel/plugin-syntax-typescript'),

        // keeping this in non-parallelizable form prevents
        // broccoli-babel-transpiler from spinning up separate worker processes,
        // which we don't want or need and which hang at the end of the test
        // suite.
        require('../../babel-plugin'),
      ],
    };
    let transpiled = broccoliBabel(new UnwatchedDir(upstream), babelConfig);
    analyzer = new Analyzer(transpiled, pack, undefined, true);
    builder = new broccoli.Builder(analyzer);
  });

  hooks.afterEach(function (this: any) {
    removeSync(this.workDir);
    if (builder) {
      return builder.cleanup();
    }
  });

  test('initial file passes through', async function (assert) {
    let original = "import 'some-package';";
    outputFileSync(join(upstream, 'sample.js'), original);
    await builder.build();
    let content = readFileSync(join(builder.outputPath, 'sample.js'), 'utf8');
    assert.ok(
      content.endsWith(original),
      `${content} should end with ${original}`
    );
  });

  test('created file passes through', async function (assert) {
    await builder.build();
    let original = "import 'some-package';";
    outputFileSync(join(upstream, 'sample.js'), original);
    await builder.build();
    let content = readFileSync(join(builder.outputPath, 'sample.js'), 'utf8');
    assert.ok(
      content.endsWith(original),
      `${content} should end with ${original}`
    );
  });

  test('updated file passes through', async function (assert) {
    let original = "import 'some-package';";
    outputFileSync(join(upstream, 'sample.js'), original);
    await builder.build();

    let updated = "import 'some-package';\nimport 'other-package';";
    outputFileSync(join(upstream, 'sample.js'), updated);
    await builder.build();

    let content = readFileSync(join(builder.outputPath, 'sample.js'), 'utf8');
    assert.ok(
      content.endsWith(updated),
      `${content} should end with ${updated}`
    );
  });

  test('deleted file passes through', async function (assert) {
    let original = "import 'some-package';";
    outputFileSync(join(upstream, 'sample.js'), original);
    await builder.build();

    removeSync(join(upstream, 'sample.js'));
    await builder.build();

    assert.ok(
      !existsSync(join(builder.outputPath, 'sample.js')),
      'should not exist'
    );
  });

  test('imports discovered in created file', async function (assert) {
    await builder.build();
    let original = "import 'some-package';";
    outputFileSync(join(upstream, 'sample.js'), original);
    await builder.build();
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

  test('imports remain constant in updated file', async function (assert) {
    let original = "import 'some-package';";
    outputFileSync(join(upstream, 'sample.js'), original);
    await builder.build();

    let updated = "import 'some-package';\nconsole.log('hi');";
    outputFileSync(join(upstream, 'sample.js'), updated);
    await builder.build();

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

  test('import added in updated file', async function (assert) {
    let original = "import 'some-package';";
    outputFileSync(join(upstream, 'sample.js'), original);
    await builder.build();

    let updated = "import 'some-package';\nimport 'other-package';";
    outputFileSync(join(upstream, 'sample.js'), updated);
    await builder.build();

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

  test('import removed in updated file', async function (assert) {
    let original = "import 'some-package';";
    outputFileSync(join(upstream, 'sample.js'), original);
    await builder.build();

    let updated = "console.log('x');";
    outputFileSync(join(upstream, 'sample.js'), updated);
    await builder.build();

    assert.deepEqual(analyzer.imports, []);
  });

  test('import removed when file deleted', async function (assert) {
    let original = "import 'some-package';";
    outputFileSync(join(upstream, 'sample.js'), original);
    await builder.build();

    removeSync(join(upstream, 'sample.js'));
    await builder.build();

    assert.deepEqual(analyzer.imports, []);
  });

  test('type-only imports ignored in created file', async function (assert) {
    await builder.build();
    let original = `
      import type Foo from 'type-import';
      import Bar from 'value-import';

      export type { Qux } from 'type-re-export';
      export { Baz } from 'value-re-export';
    `;
    outputFileSync(join(upstream, 'sample.js'), original);
    await builder.build();
    assert.deepEqual(analyzer.imports, [
      {
        isDynamic: false,
        specifier: 'value-import',
        path: 'sample.js',
        package: pack,
        treeType: undefined,
      },
      {
        isDynamic: false,
        specifier: 'value-re-export',
        path: 'sample.js',
        package: pack,
        treeType: undefined,
      },
    ]);
  });

  test('dependency discovered from reexport', async function (assert) {
    babelConfig.plugins!.push(
      // this is here because Ember does this and we want to make sure we
      // coexist with it
      [
        require.resolve('@babel/plugin-transform-modules-amd'),
        { noInterop: true },
      ]
    );
    let original = "export { default } from 'some-package';";
    outputFileSync(join(upstream, 'sample.js'), original);
    await builder.build();
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

  test('dependency discovered from namespace reexport', async function (assert) {
    let original = "export * from 'some-package';";
    outputFileSync(join(upstream, 'sample.js'), original);
    await builder.build();
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

  type LiteralExample = [string, string];
  type TemplateExample = [string, string[], string[]];
  function isLiteralExample(
    exp: LiteralExample | TemplateExample
  ): exp is LiteralExample {
    return exp.length === 2;
  }

  let legalDynamicExamples: (LiteralExample | TemplateExample)[] = [
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
    [
      'import(`data:application/javascript;base64,ZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24oKSB7IHJldHVybiAxIH0=`);',
      'data:application/javascript;base64,ZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24oKSB7IHJldHVybiAxIH0=',
    ],
    ['import(`//example.com`);', '//example.com'],
    ['import(`http://example.com`);', 'http://example.com'],
    ['import(`https://example.com`);', 'https://example.com'],
    ['import(`//example.com`);', '//example.com'],
    ['import(`http://${domain}`);', ['http://', ''], ['domain']],
    [
      'import(`https://example.com/${path}`);',
      ['https://example.com/', ''],
      ['path'],
    ],
    [
      'import(`data:application/javascript;base64,${code}`);',
      ['data:application/javascript;base64,', ''],
      ['code'],
    ],
    ['import(`//${domain}`);', ['//', ''], ['domain']],
    ['import(`alpha/${foo}`);', ['alpha/', ''], ['foo']],
    ['import(`@beta/thing/${foo}`);', ['@beta/thing/', ''], ['foo']],
    ['import(`alpha/${foo}/component`);', ['alpha/', '/component'], ['foo']],
    [
      'import(`@beta/thing/${foo}/component`);',
      ['@beta/thing/', '/component'],
      ['foo'],
    ],
    [
      'import(`alpha/${foo}/component/${bar}`);',
      ['alpha/', '/component/', ''],
      ['foo', 'bar'],
    ],
    [
      'import(`@beta/thing/${foo}/component/${bar}`);',
      ['@beta/thing/', '/component/', ''],
      ['foo', 'bar'],
    ],
  ];

  for (let example of legalDynamicExamples) {
    let [src] = example;
    test(`dynamic import example: ${src}`, async function (assert) {
      outputFileSync(join(upstream, 'sample.js'), src);
      await builder.build();
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
      } else {
        assert.deepEqual(analyzer.imports, [
          {
            isDynamic: true,
            cookedQuasis: example[1],
            expressionNameHints: example[2],
            path: 'sample.js',
            package: pack,
            treeType: undefined,
          },
        ]);
      }
    });
  }

  let legalImportSyncExamples: (LiteralExample | TemplateExample)[] = [
    ["importSync('alpha');", 'alpha'],
    ["importSync('@beta/thing');", '@beta/thing'],
    ['importSync(`gamma`);', 'gamma'],
    ['importSync(`@delta/thing`);', '@delta/thing'],
    ["importSync('epsilon/mod');", 'epsilon/mod'],
    ["importSync('@zeta/thing/mod');", '@zeta/thing/mod'],
    ['importSync(`eta/mod`);', 'eta/mod'],
    ['importSync(`@theta/thing/mod`);', '@theta/thing/mod'],
    ['importSync(`alpha/${foo}`);', ['alpha/', ''], ['foo']],
    ['importSync(`@beta/thing/${foo}`);', ['@beta/thing/', ''], ['foo']],
    [
      'importSync(`alpha/${foo}/component`);',
      ['alpha/', '/component'],
      ['foo'],
    ],
    [
      'importSync(`@beta/thing/${foo}/component`);',
      ['@beta/thing/', '/component'],
      ['foo'],
    ],
    [
      'importSync(`alpha/${foo}/component/${bar}`);',
      ['alpha/', '/component/', ''],
      ['foo', 'bar'],
    ],
    [
      'importSync(`@beta/thing/${foo}/component/${bar}`);',
      ['@beta/thing/', '/component/', ''],
      ['foo', 'bar'],
    ],
  ];

  for (let example of legalImportSyncExamples) {
    let [src] = example;
    test(`importSync example: ${src}`, async function (assert) {
      outputFileSync(
        join(upstream, 'sample.js'),
        `import { importSync } from '@embroider/macros'; ${src}`
      );
      await builder.build();
      if (isLiteralExample(example)) {
        assert.deepEqual(analyzer.imports, [
          {
            isDynamic: false,
            specifier: '@embroider/macros',
            path: 'sample.js',
            package: pack,
            treeType: undefined,
          },
          {
            isDynamic: false,
            specifier: example[1],
            path: 'sample.js',
            package: pack,
            treeType: undefined,
          },
        ]);
      } else {
        assert.deepEqual(analyzer.imports, [
          {
            isDynamic: false,
            specifier: '@embroider/macros',
            path: 'sample.js',
            package: pack,
            treeType: undefined,
          },
          {
            isDynamic: false,
            cookedQuasis: example[1],
            expressionNameHints: example[2],
            path: 'sample.js',
            package: pack,
            treeType: undefined,
          },
        ]);
      }
    });
  }

  test('disallowed patttern: unsupported syntax', async function (assert) {
    assert.expect(1);
    let src = `
    function x() {
      import((function(){ return 'hi' })());
    }
    `;
    outputFileSync(join(upstream, 'sample.js'), src);
    try {
      await builder.build();
      throw new Error(`expected not to get here, build was supposed to fail`);
    } catch (err) {
      assert.contains(
        err.message,
        'import() is only allowed to contain string literals or template string literals'
      );
    }
  });
});

Qmodule('analyzer-deserialize', function () {
  function sampleData(): ImportSyntax[] {
    return [
      {
        isDynamic: false,
        specifier: 'alpha',
      },
      {
        isDynamic: true,
        specifier: 'beta',
      },
      {
        isDynamic: false,
        cookedQuasis: ['gamma/', ''],
        expressionNameHints: [null],
      },
      {
        isDynamic: true,
        cookedQuasis: ['delta/', ''],
        expressionNameHints: ['flavor'],
      },
    ];
  }

  function source(chunks: string[]): ReadStream {
    let closer: undefined | (() => void);
    return {
      get chunksRemaining() {
        return chunks.length;
      },

      read() {
        if (chunks.length > 0) {
          return chunks.shift();
        } else {
          if (closer) {
            closer();
          }
          return null;
        }
      },
      on(event: string, handler: () => unknown) {
        if (event === 'readable') {
          setTimeout(handler, 0);
        }
        if (event === 'close') {
          closer = handler;
        }
      },
      destroy() {
        if (closer) {
          closer();
        }
      },
    } as unknown as ReadStream;
  }

  test('no meta found', async function (assert) {
    let result = await deserialize(source(['abcdefgabcdefg']));
    assert.deepEqual(result, []);
  });

  test('meta found in one chunk', async function (assert) {
    let result = await deserialize(
      source(['stuff stuff stuff ' + serialize(sampleData())])
    );
    assert.deepEqual(result, sampleData());
  });

  test('meta spans two chunks', async function (assert) {
    let meta = serialize(sampleData());
    let result = await deserialize(
      source([
        `stuff stuff stuff ${meta.slice(0, MARKER.length + 2)}`,
        meta.slice(MARKER.length + 2),
      ])
    );
    assert.deepEqual(result, sampleData());
  });

  test('meta spans three chunks', async function (assert) {
    let meta = serialize(sampleData());
    let result = await deserialize(
      source([
        `stuff stuff stuff ${meta.slice(0, MARKER.length + 2)}`,
        meta.slice(MARKER.length + 2, MARKER.length + 5),
        meta.slice(MARKER.length + 5),
      ])
    );
    assert.deepEqual(result, sampleData());
  });

  test('leaves remaining chunks unconsumed after finding meta', async function (assert) {
    let s = source([
      `stuff stuff stuff ${serialize(sampleData())} other stuff`,
      'extra',
    ]);
    let result = await deserialize(s);
    assert.deepEqual(result, sampleData());
    assert.equal((s as any).chunksRemaining, 1);
  });

  test('start marker split between chunks', async function (assert) {
    let meta = serialize(sampleData());
    let result = await deserialize(
      source([`stuff stuff stuff ${meta.slice(0, 2)}`, meta.slice(2)])
    );
    assert.deepEqual(result, sampleData());
  });

  test('false start marker at end of chunk', async function (assert) {
    let meta = serialize(sampleData());
    let result = await deserialize(
      source([`stuff stuff stuff ${meta.slice(0, 2)}`, `other${meta}`])
    );
    assert.deepEqual(result, sampleData());
  });

  test('end marker split between chunks', async function (assert) {
    let meta = serialize(sampleData());
    let result = await deserialize(
      source([`stuff stuff stuff ${meta.slice(0, -2)}`, meta.slice(-2)])
    );
    assert.deepEqual(result, sampleData());
  });

  test('false end marker at end of chunk', async function (assert) {
    const meta = serialize(sampleData());
    assert.ok(
      meta.slice(MARKER.length, -MARKER.length).indexOf(MARKER[0]) > -1,
      'serialized sample data must contain first character of MARKER somewhere between boundary markers for test to have meaning'
    );
    const slicePos =
      meta.slice(MARKER.length, -MARKER.length).indexOf(MARKER[0]) +
      MARKER.length +
      1;
    const result = await deserialize(
      source([
        `stuff stuff stuff ${meta.slice(0, slicePos)}`,
        `${meta.slice(slicePos)} stuff stuff`,
      ])
    );
    assert.deepEqual(result, sampleData());
  });
});
