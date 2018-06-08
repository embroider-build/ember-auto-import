import { module, skip } from 'qunit';
import { visit } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';

module('Acceptance | basic', function(hooks) {
  setupApplicationTest(hooks);

  skip('an addon can use an auto-imported dependency when called from an app that does not', async function(assert) {
    await visit('/');
    assert.equal(document.querySelector('[data-test="from-sample-addon"]').textContent.trim(), 'Hello');
  });
});
