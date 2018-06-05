import { module, test } from 'qunit';
import { visit } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';

module('Acceptance | basics', function(hooks) {
  setupApplicationTest(hooks);

  test('using an auto-loaded module from app code', async function(assert) {
    await visit('/');
    assert.equal(document.querySelector('.hello-world').textContent.trim(), '2018-05-31');
  });
});
