import { module, test } from 'qunit';
import { visit } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';

module('Acceptance | basic', function(hooks) {
  setupApplicationTest(hooks);

  test('innerLib works directly', async function(assert) {
    await visit('/');
    assert.equal(document.querySelector('[data-test="own"]').textContent.trim(), 'ember_auto_import_sample_lib');
  });

  test('innerLib works in addon', async function(assert) {
    await visit('/');
    assert.equal(document.querySelector('[data-test="sample-addon-inner-lib"]').textContent.trim(), 'ember_auto_import_sample_lib');
  });
});
