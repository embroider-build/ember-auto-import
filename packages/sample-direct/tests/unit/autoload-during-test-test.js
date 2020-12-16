import { module, test } from 'qunit';
import { capitalize } from 'lodash-es';

module('sample-direct | Unit | autoload module from test code', function () {
  test('using an auto-loaded module from test code', function (assert) {
    assert.equal(capitalize('hello'), 'Hello');
  });
});
