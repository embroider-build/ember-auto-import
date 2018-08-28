import { module, test } from 'qunit';
import { visit } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';

module('Acceptance | lazy component', function(hooks) {
  setupApplicationTest(hooks);

  test('visiting /lazy-component', async function(assert) {
    await visit('/lazy-component');
    assert.equal(this.element.querySelector('.from-micro-ember-lib').textContent.trim(), 'micro lib says it works');
  });
});
