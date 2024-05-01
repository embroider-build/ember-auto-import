import QUnit from 'qunit';
import 'qunit-assertions-extra';
import { commonAncestorDirectories } from '../util';

const { module: Qmodule, test } = QUnit;

Qmodule('commonAncestorDirectories', function () {
  test('returns same dirs if no nested', function (assert) {
    const result = commonAncestorDirectories([
      '/a/b/c/index.js',
      '/d/index.js',
    ]);

    assert.deepEqual(result, ['/a/b/c', '/d']);
  });

  test('returns common dirs', function (assert) {
    const result = commonAncestorDirectories([
      '/a/b/c/index.js',
      '/a/b/index.js',
      '/d/index.js',
      '/d/e/f/index.js',
    ]);

    assert.deepEqual(result, ['/a/b', '/d']);
  });

  test('ignores duplicates', function (assert) {
    const result = commonAncestorDirectories([
      '/a/b/c/index.js',
      '/a/b/index.js',
      '/a/b/c/index.js',
      '/a/b/index.js',
    ]);

    assert.deepEqual(result, ['/a/b']);
  });
});
