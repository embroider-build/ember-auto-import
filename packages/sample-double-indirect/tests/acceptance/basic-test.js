import { module, test } from 'qunit';
import { visit } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';

module('Acceptance | basic', function(hooks) {
  setupApplicationTest(hooks);

  test('an addon can use an auto-imported dependency nested two levels down inside addons', async function(assert) {
    await visit('/');
    assert.equal(document.querySelector('[data-test="from-sample-addon"]').textContent.trim(), 'Hello');
  });

});
