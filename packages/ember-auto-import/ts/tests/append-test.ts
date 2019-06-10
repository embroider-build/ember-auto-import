import QUnit from 'qunit';
import { Builder } from 'broccoli';
import { UnwatchedDir } from 'broccoli-source';
import quickTemp from 'quick-temp';
import { ensureDirSync, readFileSync, outputFileSync, removeSync, existsSync } from 'fs-extra';
import { join } from 'path';
import Append, { AppendOptions } from '../broccoli-append';

const { module: Qmodule, test } = QUnit;

Qmodule('broccoli-append', function(hooks) {

  let builder: Builder | undefined;
  let upstream: string;
  let appended: string;

  hooks.beforeEach(function(this: any) {
    quickTemp.makeOrRemake(this, 'workDir', 'auto-import-build-tests');
    ensureDirSync(upstream = join(this.workDir, 'upstream'));
    ensureDirSync(appended = join(this.workDir, 'appended'));
  });

  hooks.afterEach(function(this: any) {
    removeSync(this.workDir);
    if (builder) {
      return builder.cleanup();
    }
  });

  function makeBuilder(opts?: Partial<AppendOptions>) {
    let node = new Append(new UnwatchedDir(upstream), new UnwatchedDir(appended), Object.assign({
      mappings: new Map(),
      passthrough: new Map()
    }, opts));
    return new Builder(node);
  }

  test('non-matching file created', async function(assert) {
    builder = makeBuilder();
    await builder.build();
    let out = join(builder.outputPath, 'assets/whatever');
    outputFileSync(join(upstream, 'assets/whatever'), "hello");
    await builder.build();
    assert.equal(readFileSync(out, 'utf8'), 'hello');
  });

  test('non-matching file updated', async function(assert) {
    builder = makeBuilder();
    let out = join(builder.outputPath, 'assets/whatever');
    outputFileSync(join(upstream, 'assets/whatever'), "hello");
    await builder.build();
    outputFileSync(join(upstream, 'assets/whatever'), "goodbye");
    await builder.build();
    assert.equal(readFileSync(out, 'utf8'), 'goodbye', 'updated value');
  });

  test('non-matching file deleted', async function(assert) {
    builder = makeBuilder();
    let out = join(builder.outputPath, 'assets/whatever');
    outputFileSync(join(upstream, 'assets/whatever'), "hello");
    await builder.build();
    removeSync(join(upstream, 'assets/whatever'));
    await builder.build();
    assert.ok(!existsSync(out), 'removed');
  });

  test('nothing to be appended', async function(assert) {
    let mappings = new Map();
    let byType = new Map();
    mappings.set('app', byType);
    byType.set('js', 'assets/vendor.js');
    builder = makeBuilder({
      mappings
    });
    let out = join(builder.outputPath, 'assets/vendor.js');
    outputFileSync(join(upstream, 'assets/vendor.js'), "hello");
    ensureDirSync(join(appended, 'app'));
    await builder.build();
    assert.equal(readFileSync(out, 'utf8'), 'hello');
  });

  test('appended dir does not exist', async function(assert) {
    let mappings = new Map();
    let byType = new Map();
    mappings.set('other', byType);
    byType.set('js', 'assets/vendor.js');
    builder = makeBuilder({
      mappings
    });
    let out = join(builder.outputPath, 'assets/vendor.js');
    outputFileSync(join(upstream, 'assets/vendor.js'), "hello");
    await builder.build();
    assert.equal(readFileSync(out, 'utf8'), 'hello');
  });

  test('nothing to append to', async function(assert) {
    let mappings = new Map();
    let byType = new Map();
    mappings.set('app', byType);
    byType.set('js', 'assets/vendor.js');
    builder = makeBuilder({
      mappings
    });
    let out = join(builder.outputPath, 'assets/vendor.js');
    outputFileSync(join(appended, 'app/chunk1.js'), "from-chunk-one");
    await builder.build();
    assert.ok(!existsSync(out), 'removed');
  });

  test('all files appended', async function(assert) {
    let mappings = new Map();
    let byType = new Map();
    mappings.set('app', byType);
    byType.set('js', 'assets/vendor.js');
    byType.set('css', 'assets/vendor.css');
    builder = makeBuilder({
      mappings
    });

    let outJs = join(builder.outputPath, 'assets/vendor.js');
    outputFileSync(join(upstream, 'assets/vendor.js'), "hello");
    outputFileSync(join(appended, 'app/1.js'), "one");
    outputFileSync(join(appended, 'app/2.js'), "two");
    outputFileSync(join(appended, 'tests/3.js'), "three");

    let outCss = join(builder.outputPath, 'assets/vendor.css');
    outputFileSync(join(upstream, 'assets/vendor.css'), "hola");
    outputFileSync(join(appended, 'app/1.css'), "uno");
    outputFileSync(join(appended, 'app/2.css'), "dos");
    outputFileSync(join(appended, 'tests/3.css'), "tres");

    await builder.build();

    let content = readFileSync(outJs, 'utf8');
    assert.ok(/^hello;\n/.test(content), 'original vendor.js and separator');
    assert.ok(/\bone\b/.test(content), 'found one');
    assert.ok(/\btwo\b/.test(content), 'found two');
    assert.ok(!/\bthree\b/.test(content), 'did not find three');
    assert.ok(!/\buno\b/.test(content), 'did not find CSS');

    content = readFileSync(outCss, 'utf8');
    assert.ok(/^hola\n/.test(content), 'original vendor.css and separator');
    assert.ok(/\buno\b/.test(content), 'found uno');
    assert.ok(/\bdos\b/.test(content), 'found dos');
    assert.ok(!/\btres\b/.test(content), 'did not find tres');
    assert.ok(!/\bone\b/.test(content), 'did not find JS');
  });

  test('moves trailing sourceMappingURL', async function(assert) {
    let mappings = new Map();
    let byType = new Map();
    mappings.set('app', byType);
    byType.set('js', 'assets/vendor.js');
    builder = makeBuilder({
      mappings
    });
    let out = join(builder.outputPath, 'assets/vendor.js');
    outputFileSync(join(upstream, 'assets/vendor.js'), "function(){ console.log('hi'); } //# sourceMappingURL=vendor.map \n");
    outputFileSync(join(appended, 'app/1.js'), "one");
    await builder.build();
    let content = readFileSync(out, 'utf8');
    assert.equal(content, "function(){ console.log('hi'); } ;\none//# sourceMappingURL=vendor.map \n");
  });

  test('does not match non-trailing sourceMappingURL', async function(assert) {
    let mappings = new Map();
    let byType = new Map();
    mappings.set('app', byType);
    byType.set('js', 'assets/vendor.js');
    builder = makeBuilder({
      mappings
    });
    let out = join(builder.outputPath, 'assets/vendor.js');
    outputFileSync(join(upstream, 'assets/vendor.js'), "function(){ console.log('hi'); } //# sourceMappingURL=vendor.map \nfunction(){ console.log('bye'); }");
    outputFileSync(join(appended, 'app/1.js'), "one");
    await builder.build();
    let content = readFileSync(out, 'utf8');
    assert.equal(content, "function(){ console.log('hi'); } //# sourceMappingURL=vendor.map \nfunction(){ console.log('bye'); };\none");
  });

  test('upstream changed', async function(assert) {
    let mappings = new Map();
    let byType = new Map();
    mappings.set('app', byType);
    byType.set('js', 'assets/vendor.js');
    byType.set('css', 'assets/vendor.css');
    builder = makeBuilder({
      mappings
    });

    let outJs = join(builder.outputPath, 'assets/vendor.js');
    outputFileSync(join(upstream, 'assets/vendor.js'), "hello");
    outputFileSync(join(appended, 'app/1.js'), "one");
    outputFileSync(join(appended, 'app/2.js'), "two");

    let outCss = join(builder.outputPath, 'assets/vendor.css');
    outputFileSync(join(upstream, 'assets/vendor.css'), "hola");
    outputFileSync(join(appended, 'app/1.css'), "uno");
    outputFileSync(join(appended, 'app/2.css'), "dos");

    await builder.build();

    outputFileSync(join(upstream, 'assets/vendor.js'), "bonjour");
    outputFileSync(join(upstream, 'assets/vendor.css'), "gutentag");

    await builder.build();

    let content = readFileSync(outJs, 'utf8');
    assert.ok(/^bonjour;\n/.test(content), 'original vendor.js and separator');
    assert.ok(/\bone\b/.test(content), 'found one');
    assert.ok(/\btwo\b/.test(content), 'found two');
    assert.ok(!/\buno\b/.test(content), 'did not find CSS');

    content = readFileSync(outCss, 'utf8');
    assert.ok(/^gutentag\n/.test(content), 'original vendor.css and separator');
    assert.ok(/\buno\b/.test(content), 'found uno');
    assert.ok(/\bdos\b/.test(content), 'found dos');
    assert.ok(!/\bone\b/.test(content), 'did not find JS');
  });

  test('inner appended changed', async function(assert) {
    let mappings = new Map();
    let byType = new Map();
    mappings.set('app/inner', byType);
    byType.set('js', 'assets/vendor.js');
    builder = makeBuilder({
      mappings
    });
    let out = join(builder.outputPath, 'assets/vendor.js');
    outputFileSync(join(upstream, 'assets/vendor.js'), "hello");
    outputFileSync(join(appended, 'app/inner/1.js'), "one");
    outputFileSync(join(appended, 'app/inner/2.js'), "two");
    await builder.build();

    outputFileSync(join(appended, 'app/inner/1.js'), "updated");
    await builder.build();

    let content = readFileSync(out, 'utf8');
    assert.ok(/^hello;\n/.test(content), 'original vendor.js and separator');
    assert.ok(/\bupdated\b/.test(content), 'found updated');
    assert.ok(/\btwo\b/.test(content), 'found two');
  });

  test('appended changed', async function(assert) {
    let mappings = new Map();
    let byType = new Map();
    mappings.set('app', byType);
    byType.set('js', 'assets/vendor.js');
    byType.set('css', 'assets/vendor.css');
    builder = makeBuilder({
      mappings
    });

    let outJs = join(builder.outputPath, 'assets/vendor.js');
    outputFileSync(join(upstream, 'assets/vendor.js'), "hello");
    outputFileSync(join(appended, 'app/1.js'), "one");
    outputFileSync(join(appended, 'app/2.js'), "two");

    let outCss = join(builder.outputPath, 'assets/vendor.css');
    outputFileSync(join(upstream, 'assets/vendor.css'), "hola");
    outputFileSync(join(appended, 'app/1.css'), "uno");
    outputFileSync(join(appended, 'app/2.css'), "dos");

    await builder.build();

    outputFileSync(join(appended, 'app/1.js'), "updated");
    outputFileSync(join(appended, 'app/1.css'), "modified");

    await builder.build();

    let content = readFileSync(outJs, 'utf8');
    assert.ok(/^hello;\n/.test(content), 'original vendor.js and separator');
    assert.ok(/\bupdated\b/.test(content), 'found updated');
    assert.ok(/\btwo\b/.test(content), 'found two');

    content = readFileSync(outCss, 'utf8');
    assert.ok(/^hola\n/.test(content), 'original vendor.css and separator');
    assert.ok(/\bmodified\b/.test(content), 'found modified');
    assert.ok(/\bdos\b/.test(content), 'found dos');
  });

  test('upstream and appended changed', async function(assert) {
    let mappings = new Map();
    let byType = new Map();
    mappings.set('app', byType);
    byType.set('js', 'assets/vendor.js');
    byType.set('css', 'assets/vendor.css');
    builder = makeBuilder({
      mappings
    });

    let outJs = join(builder.outputPath, 'assets/vendor.js');
    outputFileSync(join(upstream, 'assets/vendor.js'), "hello");
    outputFileSync(join(appended, 'app/1.js'), "one");
    outputFileSync(join(appended, 'app/2.js'), "two");

    let outCss = join(builder.outputPath, 'assets/vendor.css');
    outputFileSync(join(upstream, 'assets/vendor.css'), "hola");
    outputFileSync(join(appended, 'app/1.css'), "uno");
    outputFileSync(join(appended, 'app/2.css'), "dos");

    await builder.build();

    outputFileSync(join(upstream, 'assets/vendor.js'), "bonjour");
    outputFileSync(join(appended, 'app/1.js'), "updated");
    outputFileSync(join(upstream, 'assets/vendor.css'), "guten tag");
    outputFileSync(join(appended, 'app/1.css'), "modified");

    await builder.build();

    let content = readFileSync(outJs, 'utf8');
    assert.ok(/^bonjour;\n/.test(content), 'original vendor.js and separator');
    assert.ok(/\bupdated\b/.test(content), 'found updated');
    assert.ok(/\btwo\b/.test(content), 'found two');

    content = readFileSync(outCss, 'utf8');
    assert.ok(/^guten tag\n/.test(content), 'original vendor.css and separator');
    assert.ok(/\bmodified\b/.test(content), 'found modified');
    assert.ok(/\bdos\b/.test(content), 'found dos');
  });

  test('additional appended file', async function(assert) {
    let mappings = new Map();
    let byType = new Map();
    mappings.set('app', byType);
    byType.set('js', 'assets/vendor.js');
    byType.set('css', 'assets/vendor.css');
    builder = makeBuilder({
      mappings
    });

    let outJs = join(builder.outputPath, 'assets/vendor.js');
    outputFileSync(join(upstream, 'assets/vendor.js'), "hello");
    outputFileSync(join(appended, 'app/1.js'), "one");
    outputFileSync(join(appended, 'app/2.js'), "two");

    let outCss = join(builder.outputPath, 'assets/vendor.css');
    outputFileSync(join(upstream, 'assets/vendor.css'), "hola");
    outputFileSync(join(appended, 'app/1.css'), "uno");
    outputFileSync(join(appended, 'app/2.css'), "dos");

    await builder.build();

    outputFileSync(join(appended, 'app/3.js'), "three");
    outputFileSync(join(appended, 'app/3.css'), "tres");

    await builder.build();

    let content = readFileSync(outJs, 'utf8');
    assert.ok(/^hello;\n/.test(content), 'original vendor.js and separator');
    assert.ok(/\bone\b/.test(content), 'found uno');
    assert.ok(/\btwo\b/.test(content), 'found two');
    assert.ok(/\bthree\b/.test(content), 'found three');

    content = readFileSync(outCss, 'utf8');
    assert.ok(/^hola\n/.test(content), 'original vendor.css and separator');
    assert.ok(/\buno\b/.test(content), 'found uno');
    assert.ok(/\bdos\b/.test(content), 'found dos');
    assert.ok(/\btres\b/.test(content), 'found tres');
  });

  test('removed appended file', async function(assert) {
    let mappings = new Map();
    let byType = new Map();
    mappings.set('app', byType);
    byType.set('js', 'assets/vendor.js');
    byType.set('css', 'assets/vendor.css');
    builder = makeBuilder({
      mappings
    });

    let outJs = join(builder.outputPath, 'assets/vendor.js');
    outputFileSync(join(upstream, 'assets/vendor.js'), "hello");
    outputFileSync(join(appended, 'app/1.js'), "one");
    outputFileSync(join(appended, 'app/2.js'), "two");

    let outCss = join(builder.outputPath, 'assets/vendor.css');
    outputFileSync(join(upstream, 'assets/vendor.css'), "hola");
    outputFileSync(join(appended, 'app/1.css'), "uno");
    outputFileSync(join(appended, 'app/2.css'), "dos");

    await builder.build();

    removeSync(join(appended, 'app/1.js'));
    removeSync(join(appended, 'app/1.css'));

    await builder.build();

    let content = readFileSync(outJs, 'utf8');
    assert.ok(/^hello;\n/.test(content), 'original vendor.js and separator');
    assert.ok(!/\bone\b/.test(content), 'did not find one');
    assert.ok(/\btwo\b/.test(content), 'found two');

    content = readFileSync(outCss, 'utf8');
    assert.ok(/^hola\n/.test(content), 'original vendor.css and separator');
    assert.ok(!/\buno\b/.test(content), 'did not find uno');
    assert.ok(/\bdos\b/.test(content), 'found dos');
  });

  test('removed upstream file', async function(assert) {
    let mappings = new Map();
    let byType = new Map();
    mappings.set('app', byType);
    byType.set('js', 'assets/vendor.js');
    byType.set('css', 'assets/vendor.css');
    builder = makeBuilder({
      mappings
    });

    let outJs = join(builder.outputPath, 'assets/vendor.js');
    outputFileSync(join(upstream, 'assets/vendor.js'), "hello");
    outputFileSync(join(appended, 'app/1.js'), "one");
    outputFileSync(join(appended, 'app/2.js'), "two");

    let outCss = join(builder.outputPath, 'assets/vendor.css');
    outputFileSync(join(upstream, 'assets/vendor.css'), "hola");
    outputFileSync(join(appended, 'app/1.css'), "uno");
    outputFileSync(join(appended, 'app/2.css'), "dos");

    await builder.build();

    removeSync(join(upstream, 'assets/vendor.js'));
    removeSync(join(upstream, 'assets/vendor.css'));

    await builder.build();

    assert.ok(!existsSync(outJs), 'removed js');
    assert.ok(!existsSync(outCss), 'removed css');
  });

  test('passthrough file created', async function(assert) {
    let passthrough = new Map();
    passthrough.set('lazy', 'assets');
    builder = makeBuilder({
      passthrough
    });
    let out = join(builder.outputPath, 'assets/1.js');
    await builder.build();

    outputFileSync(join(appended, 'lazy/1.js'), "one");
    await builder.build();

    assert.equal(readFileSync(out, 'utf8'), 'one');
  });

  test('passthrough file updated', async function(assert) {
    let passthrough = new Map();
    passthrough.set('lazy', 'assets');
    builder = makeBuilder({
      passthrough
    });
    let out = join(builder.outputPath, 'assets/1.js');
    outputFileSync(join(appended, 'lazy/1.js'), "one");
    await builder.build();

    outputFileSync(join(appended, 'lazy/1.js'), "updated");
    await builder.build();

    assert.equal(readFileSync(out, 'utf8'), 'updated');
  });

  test('inner passthrough file updated', async function(assert) {
    let passthrough = new Map();
    passthrough.set('lazy/inner', 'assets');
    builder = makeBuilder({
      passthrough
    });
    let out = join(builder.outputPath, 'assets/1.js');
    outputFileSync(join(appended, 'lazy/inner/1.js'), "one");
    await builder.build();

    outputFileSync(join(appended, 'lazy/inner/1.js'), "updated");
    await builder.build();

    assert.equal(readFileSync(out, 'utf8'), 'updated');
  });

  test('passthrough file deleted', async function(assert) {
    let passthrough = new Map();
    passthrough.set('lazy', 'assets');
    builder = makeBuilder({
      passthrough
    });
    let out = join(builder.outputPath, 'assets/1.js');
    outputFileSync(join(appended, 'lazy/1.js'), "one");
    await builder.build();

    removeSync(join(appended, 'lazy/1.js'));
    await builder.build();

    assert.ok(!existsSync(out), 'removed');
  });

  test('appended and passthrough target same directory', async function(assert) {
    let passthrough = new Map();
    passthrough.set('lazy', 'assets');

    let mappings = new Map();
    let byType = new Map();
    mappings.set('app', byType);
    byType.set('js', 'assets');

    builder = makeBuilder({
      mappings,
      passthrough
    });

    outputFileSync(join(upstream, 'assets/vendor.js'), "hello");
    outputFileSync(join(appended, 'lazy/1.js'), "one");

    await builder.build();

    assert.ok(existsSync(join(builder.outputPath, 'assets/vendor.js')), 'vendor.js');
    assert.ok(existsSync(join(builder.outputPath, 'assets/1.js')), '1.js');
  });
});
