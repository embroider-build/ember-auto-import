import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render } from '@ember/test-helpers';
import hbs from 'htmlbars-inline-precompile';

module('Integration | Component | hello-world', function (hooks) {
  setupRenderingTest(hooks);

  test('using an auto-loaded module from app code', async function (assert) {
    await render(hbs`{{hello-world}}`);
    assert.equal(document.querySelector('.hello-world').textContent.trim(), '2018-05-31');
  });

  test('using an aliased module', async function (assert) {
    await render(hbs`{{hello-world}}`);
    assert.equal(document.querySelector('.aliased').textContent.trim(), 'innerlib2 loaded');
  });

  test('using a prefix match aliased module', async function (assert) {
    await render(hbs`{{hello-world}}`);
    assert.equal(document.querySelector('.prefix-aliased').textContent.trim(), 'deeper named');
  });

  test('using a scoped module', async function (assert) {
    await render(hbs`{{hello-world}}`);
    assert.equal(document.querySelector('.scoped').textContent.trim(), 'this-is-from-ef4-scoped');
  });

  test('using a compiled module import', async function (assert) {
    await render(hbs`{{hello-world}}`);
    assert.equal(document.querySelector('.module-dependency').textContent.trim(), 'module transpiled');
  });
});
