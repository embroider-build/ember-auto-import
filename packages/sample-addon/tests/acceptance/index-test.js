import { module, test } from 'qunit';
import { visit } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';

module('Acceptance | index', function(hooks) {
  setupApplicationTest(hooks);

  test('can auto import devDependencies from within dummy app', async function(assert) {
    await visit('/');
    assert.equal(document.querySelector('[data-test="dummy-app-message"]').textContent.trim(), '2018');
  });
});
