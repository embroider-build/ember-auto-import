import { module, test } from 'qunit';
import { visit, currentURL } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';

module('Acceptance | dynamic import', function (hooks) {
  setupApplicationTest(hooks);

  test('dynamic-import', async function (assert) {
    await visit('/dynamic-import');
    assert.equal(currentURL(), '/dynamic-import');
    assert.equal(
      document.querySelector('[data-test="dynamic-import-result"]').textContent.trim(),
      'ember-auto-import-a-dependency'
    );
  });

  test('template dynamic-import', async function (assert) {
    await visit('/flavor/vanilla');
    assert.equal(currentURL(), '/flavor/vanilla');
    assert.equal(document.querySelector('[data-test="dynamic-import-result"]').textContent.trim(), 'vanilla');
  });

  test('browser can use native import', async function (assert) {
    await visit('/native-import');
    assert.equal(currentURL(), '/native-import');
    let expected = typeof FastBoot === 'undefined' ? 'browser' : 'server';
    assert.equal(document.querySelector('[data-test="dynamic-import-result"]').textContent.trim(), expected);
  });
});
