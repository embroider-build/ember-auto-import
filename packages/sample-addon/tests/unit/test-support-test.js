import thing from 'sample-addon/test-support';
import { module, test } from 'qunit';

module('Unit | imports in test-support', function () {
  test('it works', function (assert) {
    assert.equal(thing(), 'innerlib2 loaded');
  });
});
