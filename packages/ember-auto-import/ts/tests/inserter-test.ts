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
  readJSONSync,
} from 'fs-extra';
import { join } from 'path';
import { Inserter } from '../inserter';
import BundleConfig from '../bundle-config';
import { BuildResult, Bundler } from '../bundler';
const { module: Qmodule, test } = QUnit;

Qmodule('inserter', function (hooks) {
  let builder: Builder;
  let upstream: string;
  let publicAssetURL: string;
  let bundleConfig: BundleConfig;
  let buildResult: BuildResult;
  let insertScriptsAt: string | undefined;
  let insertStylesAt: string | undefined;

  async function build() {
    let inserter = new Inserter(
      new UnwatchedDir(upstream),
      { buildResult } as Bundler,
      bundleConfig,
      {
        publicAssetURL,
        insertScriptsAt,
        insertStylesAt,
      }
    );
    builder = new broccoli.Builder(inserter);
    await builder.build();
  }

  function writeIndex(src: string) {
    outputFileSync(join(upstream, 'index.html'), src);
  }

  function readIndex(): string {
    return readFileSync(join(builder.outputPath, 'index.html'), 'utf8');
  }

  hooks.beforeEach(function (this: any) {
    quickTemp.makeOrRemake(this, 'workDir', 'auto-import-inserter-tests');
    ensureDirSync((upstream = join(this.workDir, 'upstream')));
    buildResult = {
      entrypoints: new Map(),
      lazyAssets: [],
    };
    bundleConfig = new BundleConfig({
      app: {
        html: 'index.html',
      },
      vendor: { css: '/assets/vendor.css', js: '/assets/vendor.js' },
    });
    publicAssetURL = '/assets/';
  });

  hooks.afterEach(function (this: any) {
    removeSync(this.workDir);
    if (builder) {
      return builder.cleanup();
    }
  });

  test('does not error when we have nothing to insert', async function (assert) {
    writeIndex('');
    await build();
    assert.expect(0);
  });

  test('errors when we cannot find a place for app js', async function (assert) {
    buildResult.entrypoints.set('app', ['assets/chunk.1.js']);
    writeIndex('');
    try {
      await build();
      throw new Error('should not get here');
    } catch (err: any) {
      assert.contains(
        err.message,
        'ember-auto-import could not find a place to insert app scripts in index.html'
      );
    }
  });

  test('errors when we cannot find a place for app css', async function (assert) {
    buildResult.entrypoints.set('app', ['assets/chunk.1.css']);
    writeIndex('');
    try {
      await build();
      throw new Error('should not get here');
    } catch (err: any) {
      assert.contains(
        err.message,
        'ember-auto-import could not find a place to insert app styles in index.html'
      );
    }
  });

  test('inserts app scripts after vendor.js', async function (assert) {
    buildResult.entrypoints.set('app', ['assets/chunk.1.js']);
    writeIndex(`<script src="/assets/vendor.js"></script>`);
    await build();
    assert.equal(
      readIndex(),
      `<script src="/assets/vendor.js"></script>\n<script src="/assets/chunk.1.js"></script>`
    );
  });

  test('inserts fastboot scripts when using newer fastboot manifest', async function (assert) {
    buildResult.entrypoints.set('app', ['assets/chunk.1.js']);
    buildResult.lazyAssets.push('assets/chunk.2.js');
    writeIndex(`<script src="/assets/vendor.js"></script>`);
    outputFileSync(
      join(upstream, 'package.json'),
      JSON.stringify({
        fastboot: {
          schemaVersion: 5,
        },
      })
    );
    await build();
    assert.equal(
      readIndex(),
      `<script src="/assets/vendor.js"></script>\n<script src="/assets/chunk.1.js"></script>\n<fastboot-script src="/assets/chunk.2.js"></fastboot-script>`
    );
  });

  test('inserts scripts into older fastboot manifest', async function (assert) {
    buildResult.entrypoints.set('app', ['assets/chunk.1.js']);
    buildResult.lazyAssets.push('assets/chunk.2.js');
    writeIndex(`<script src="/assets/vendor.js"></script>`);
    outputFileSync(
      join(upstream, 'package.json'),
      JSON.stringify({
        fastboot: {
          schemaVersion: 3,
          manifest: {
            vendorFiles: ['something.js'],
          },
        },
      })
    );
    await build();
    assert.equal(
      readIndex(),
      `<script src="/assets/vendor.js"></script>\n<script src="/assets/chunk.1.js"></script>`
    );
    assert.deepEqual(readJSONSync(join(builder.outputPath, 'package.json')), {
      fastboot: {
        schemaVersion: 3,
        manifest: {
          vendorFiles: [
            'something.js',
            'assets/chunk.1.js',
            'assets/chunk.2.js',
          ],
        },
      },
    });
  });

  test('inserts app styles after vendor.css', async function (assert) {
    buildResult.entrypoints.set('app', ['assets/chunk.1.css']);
    writeIndex(`<link rel="stylesheet" href="/assets/vendor.css"/>`);
    await build();
    assert.equal(
      readIndex(),
      `<link rel="stylesheet" href="/assets/vendor.css"/>\n<link rel="stylesheet" href="/assets/chunk.1.css"/>`
    );
  });

  test('inserts app scripts after customized vendor.js', async function (assert) {
    bundleConfig = new BundleConfig({
      app: {
        html: 'index.html',
      },
      vendor: { css: '/assets/vendor.css', js: '/assets/rodnev.js' },
    });
    buildResult.entrypoints.set('app', ['assets/chunk.1.js']);
    writeIndex(`<script src="/assets/rodnev.js"></script>`);
    await build();
    assert.equal(
      readIndex(),
      `<script src="/assets/rodnev.js"></script>\n<script src="/assets/chunk.1.js"></script>`
    );
  });

  test('inserts app styles after customized vendor.css', async function (assert) {
    bundleConfig = new BundleConfig({
      app: {
        html: 'index.html',
      },
      vendor: { css: '/assets/rodnev.css', js: '/assets/rodnev.js' },
    });
    buildResult.entrypoints.set('app', ['assets/chunk.1.css']);
    writeIndex(`<link rel="stylesheet" href="/assets/rodnev.css"/>`);
    await build();
    assert.equal(
      readIndex(),
      `<link rel="stylesheet" href="/assets/rodnev.css"/>\n<link rel="stylesheet" href="/assets/chunk.1.css"/>`
    );
  });

  test('uses customized publicAssetURL for JS', async function (assert) {
    publicAssetURL = 'https://cdn.com/4321/assets/';
    buildResult.entrypoints.set('app', ['assets/chunk.1.js']);
    writeIndex(`<script src="/assets/vendor.js"></script>`);
    await build();
    assert.equal(
      readIndex(),
      `<script src="/assets/vendor.js"></script>\n<script src="https://cdn.com/4321/assets/chunk.1.js"></script>`
    );
  });

  test('uses customized publicAssetURL for css', async function (assert) {
    publicAssetURL = 'https://cdn.com/4321/assets/';
    buildResult.entrypoints.set('app', ['assets/chunk.1.css']);
    writeIndex(`<link rel="stylesheet" href="/assets/vendor.css"/>`);
    await build();
    assert.equal(
      readIndex(),
      `<link rel="stylesheet" href="/assets/vendor.css"/>\n<link rel="stylesheet" href="https://cdn.com/4321/assets/chunk.1.css"/>`
    );
  });

  test('can customize script insertion location', async function (assert) {
    buildResult.entrypoints.set('app', ['assets/chunk.1.js']);
    insertScriptsAt = 'auto-import-script';
    writeIndex(
      `<auto-import-script entrypoint="app"></auto-import-script>\n<script src="/assets/vendor.js"></script>`
    );
    await build();
    assert.equal(
      readIndex(),
      `<script src="/assets/chunk.1.js"></script>\n<script src="/assets/vendor.js"></script>`
    );
  });

  test('customized script insertion supports fastboot-script', async function (assert) {
    buildResult.entrypoints.set('app', ['assets/chunk.1.js']);
    buildResult.lazyAssets.push('assets/chunk.2.js');
    outputFileSync(
      join(upstream, 'package.json'),
      JSON.stringify({
        fastboot: {
          schemaVersion: 5,
        },
      })
    );
    insertScriptsAt = 'auto-import-script';
    writeIndex(
      `<auto-import-script entrypoint="app" data-foo="bar"></auto-import-script>\n<script src="/assets/vendor.js"></script>`
    );
    await build();
    assert.equal(
      readIndex(),
      `<script src="/assets/chunk.1.js" data-foo="bar"></script>\n<fastboot-script src="/assets/chunk.2.js" data-foo="bar"></fastboot-script>\n<script src="/assets/vendor.js"></script>`
    );
  });

  test('can customize attributes on inserted script', async function (assert) {
    buildResult.entrypoints.set('app', ['assets/chunk.1.js']);
    insertScriptsAt = 'auto-import-script';
    writeIndex(
      `<div><auto-import-script entrypoint="app" defer data-foo="bar"></auto-import-script></div>`
    );
    await build();
    assert.equal(
      readIndex(),
      `<div><script src="/assets/chunk.1.js" defer data-foo="bar"></script></div>`
    );
  });

  test('removes unused custom script element', async function (assert) {
    insertScriptsAt = 'auto-import-script';
    writeIndex(
      `<div><auto-import-script entrypoint="app"></auto-import-script></div><script src="/assets/vendor.js"></script>`
    );
    await build();
    assert.equal(
      readIndex(),
      `<div></div><script src="/assets/vendor.js"></script>`
    );
  });

  test('errors when custom script element is missing entrypoint', async function (assert) {
    buildResult.entrypoints.set('app', ['assets/chunk.1.css']);
    insertScriptsAt = 'auto-import-script';
    writeIndex('<auto-import-script />');
    try {
      await build();
      throw new Error('should not get here');
    } catch (err: any) {
      assert.contains(
        err.message,
        '<auto-import-script/> element in index.html is missing required entrypoint attribute'
      );
    }
  });

  test('errors when custom element is configured but not present', async function (assert) {
    buildResult.entrypoints.set('app', ['assets/chunk.1.js']);
    insertScriptsAt = 'auto-import-script';
    writeIndex('<uto-import-script entrypoint="app"></uto-import-script>');
    try {
      await build();
      throw new Error('should not get here');
    } catch (err: any) {
      assert.contains(
        err.message,
        'ember-auto-import cannot find <auto-import-script entrypoint="app"> in index.html'
      );
    }
  });

  test('can customize style insertion location', async function (assert) {
    buildResult.entrypoints.set('app', ['assets/chunk.1.css']);
    insertStylesAt = 'auto-import-style';
    writeIndex(
      `<auto-import-style entrypoint="app"></auto-import-style>\n<link rel="stylesheet" href="/assets/vendor.css"/>`
    );
    await build();
    assert.equal(
      readIndex(),
      `<link rel="stylesheet" href="/assets/chunk.1.css"/>\n<link rel="stylesheet" href="/assets/vendor.css"/>`
    );
  });

  test('can customize attributes on inserted style', async function (assert) {
    buildResult.entrypoints.set('app', ['assets/chunk.1.css']);
    insertScriptsAt = 'auto-import-style';
    writeIndex(
      `<div><auto-import-style entrypoint="app" data-baz data-foo="bar"></auto-import-style></div>`
    );
    await build();
    assert.equal(
      readIndex(),
      `<div><link rel="stylesheet" href="/assets/chunk.1.css" data-baz data-foo="bar"/></div>`
    );
  });

  test('removes unused custom style element', async function (assert) {
    insertScriptsAt = 'auto-import-style';
    writeIndex(
      `<div><auto-import-style entrypoint="app"></auto-import-style></div><link rel="styleshee" href="/assets/vendor.css"/>`
    );
    await build();
    assert.equal(
      readIndex(),
      `<div></div><link rel="styleshee" href="/assets/vendor.css"/>`
    );
  });

  test('errors when custom style element is missing entrypoint', async function (assert) {
    buildResult.entrypoints.set('app', ['assets/chunk.1.css']);
    insertStylesAt = 'auto-import-style';
    writeIndex('<auto-import-style></auto-import-style');
    try {
      await build();
      throw new Error('should not get here');
    } catch (err: any) {
      assert.contains(
        err.message,
        '<auto-import-style/> element in index.html is missing required entrypoint attribute'
      );
    }
  });
});
