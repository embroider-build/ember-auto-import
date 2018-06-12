import { module, test } from 'qunit';
import named from 'inner-lib2/named';
import deeperIndex from 'inner-lib2/deeper';
import deeperNamed from 'inner-lib2/deeper/named';

module('Unit | inner modules', function() {
  test('module imported by filename from top-level of its package', function(assert) {
    assert.equal(named(), 'named');
  });
  test('module imported from index.js inside a subdir of its package', function(assert) {
    assert.equal(deeperIndex(), 'deeper index');
  });
  test('module imported by filename inside a subdir of its package', function(assert) {
    assert.equal(deeperNamed(), 'deeper named');
  });
});
