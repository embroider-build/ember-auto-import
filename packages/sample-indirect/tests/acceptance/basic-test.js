import { module, test } from 'qunit';
import { visit } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';

module('Acceptance | basic', function(hooks) {
  setupApplicationTest(hooks);

  test('an addon can use an auto-imported dependency when called from an app that does not', async function(assert) {
    await visit('/');
    assert.equal(document.querySelector('[data-test="from-sample-addon"]').textContent.trim(), 'Hello');
  });

  test('an addon can resolve a dependency relative to itself, not the host app', async function(assert) {
    await visit('/inner');
    assert.equal(document.querySelector('[data-test="sample-addon-inner-lib"]').textContent.trim(), 'ember_auto_import_sample_lib');
  });

  test('addon-test-support deps are present inside the test suite', async function(assert) {
    await visit('/dep-check');
    assert.equal(document.querySelector('[data-test="lib2-status"]').textContent.trim(), 'yes', 'expected inner-lib2 to be present');
  });

});
