import { module, test } from 'qunit';
import { visit } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';

module('Acceptance | basic', function (hooks) {
  setupApplicationTest(hooks);

  test('visiting /basic', async function (assert) {
    await visit('/');
    assert.equal(document.querySelector('[data-test-module-result]').textContent.trim(), 'module not transpiled');
  });
});
