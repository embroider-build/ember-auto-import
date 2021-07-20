import QUnit from 'qunit';
import 'qunit-assertions-extra';
import broccoli, { Builder } from 'broccoli';
import { UnwatchedDir } from 'broccoli-source';
import quickTemp from 'quick-temp';
import { ensureDirSync, readFileSync, outputFileSync, removeSync } from 'fs-extra';
import { join } from 'path';
import { Inserter } from '../inserter';
import BundleConfig from '../bundle-config';
import { BuildResult, Bundler } from '../bundler';
const { module: Qmodule, test } = QUnit;

Qmodule('inserter', function (hooks) {
  let builder: Builder;
  let upstream: string;
  let publicAssetURL: string | undefined;
  let bundleConfig: BundleConfig;
  let buildResult: BuildResult;

  async function build() {
    let inserter = new Inserter(new UnwatchedDir(upstream), { buildResult } as Bundler, bundleConfig, publicAssetURL);
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
    publicAssetURL = undefined;
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
      assert.contains(err.message, 'ember-auto-import could not find a place to insert app scripts in index.html');
    }
  });

  test('errors when we cannot find a place for app css', async function (assert) {
    buildResult.entrypoints.set('app', ['assets/chunk.1.css']);
    writeIndex('');
    try {
      await build();
      throw new Error('should not get here');
    } catch (err: any) {
      assert.contains(err.message, 'ember-auto-import could not find a place to insert app styles in index.html');
    }
  });

  test('inserts app scripts after vendor.js', async function (assert) {
    buildResult.entrypoints.set('app', ['assets/chunk.1.js']);
    writeIndex(`<script src="/assets/vendor.js"></script>`);
    await build();
    assert.equal(readIndex(), `<script src="/assets/vendor.js"></script>\n<script src="/assets/chunk.1.js"></script>`);
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
    assert.equal(readIndex(), `<script src="/assets/rodnev.js"></script>\n<script src="/assets/chunk.1.js"></script>`);
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

  test('uses same rootURL as vendor.js', async function (assert) {
    buildResult.entrypoints.set('app', ['assets/chunk.1.js']);
    writeIndex(`<script src="https://cdn.com/1234/assets/vendor.js"></script>`);
    await build();
    assert.equal(
      readIndex(),
      `<script src="https://cdn.com/1234/assets/vendor.js"></script>\n<script src="https://cdn.com/1234/assets/chunk.1.js"></script>`
    );
  });

  test('uses same rootURL as vendor.css', async function (assert) {
    buildResult.entrypoints.set('app', ['assets/chunk.1.css']);
    writeIndex(`<link rel="stylesheet" href="https://cdn.com/1234/assets/vendor.css"/>`);
    await build();
    assert.equal(
      readIndex(),
      `<link rel="stylesheet" href="https://cdn.com/1234/assets/vendor.css"/>\n<link rel="stylesheet" href="https://cdn.com/1234/assets/chunk.1.css"/>`
    );
  });
});
