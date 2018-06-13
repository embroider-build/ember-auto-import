import { module, test } from 'qunit';
import { visit } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';

module('Acceptance | basic', function(hooks) {
  setupApplicationTest(hooks);

  test('innerLib works directly', async function(assert) {
    await visit('/');
    assert.equal(document.querySelector('[data-test="own-inner-lib"]').textContent.trim(), 'ember_auto_import_sample_lib');
  });

  test('innerLib works in addon', async function(assert) {
    await visit('/');
    assert.equal(document.querySelector('[data-test="sample-addon-inner-lib"]').textContent.trim(), 'ember_auto_import_sample_lib');
  });

  test('innerLib works in addon', async function(assert) {
    await visit('/');
    assert.equal(document.querySelector('[data-test="sample-addon-inner-lib"]').textContent.trim(), 'ember_auto_import_sample_lib');
  });

  test('innerLib2 works', async function(assert) {
    await visit('/');
    assert.equal(document.querySelector('[data-test="own-inner-lib2"]').textContent.trim(), 'innerlib2 loaded');
  });

  test('innerLib2Named works', async function(assert) {
    await visit('/');
    assert.equal(document.querySelector('[data-test="own-inner-lib2-named"]').textContent.trim(), 'ember_auto_import_inner_lib2_named');
  });

});
