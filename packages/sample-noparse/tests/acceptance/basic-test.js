import { module, test } from 'qunit';
import { visit } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';

module('Acceptance | basic', function(hooks) {
  setupApplicationTest(hooks);

  test('the noparsed-dep loads correctly', async function(assert) {
    await visit('/');
    assert.equal(document.querySelector('[data-test-import-result]').textContent.trim(), 'ember-auto-import-noparsed-dependency');
  });
});
