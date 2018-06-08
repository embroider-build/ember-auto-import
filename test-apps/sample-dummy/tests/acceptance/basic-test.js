import { module, test } from 'qunit';
import { visit } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';

module('Acceptance | basic', function(hooks) {
  setupApplicationTest(hooks);

  test('can use auto-import in a dummy app', async function(assert) {
    await visit('/');
    assert.equal(document.querySelector('[data-test="message"]').textContent.trim(), 'Hello');
  });
});
