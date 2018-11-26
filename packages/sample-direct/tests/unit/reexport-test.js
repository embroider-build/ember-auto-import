import { module, test } from 'qunit';
import { innerLib } from 'sample-direct/reexport';

module('sample-direct | Unit | reexports are found', function() {
  test('can use inner lib', function(assert) {
    assert.equal(innerLib(), 'ember_auto_import_sample_lib');
  });
});
