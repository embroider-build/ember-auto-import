import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render, settled } from '@ember/test-helpers';
import hbs from 'htmlbars-inline-precompile';

module('Integration | Component | import-sync', function (hooks) {
  setupRenderingTest(hooks);

  test('using an auto-loaded module from app code', async function (assert) {
    await render(hbs`{{import-sync}}`);
    assert.equal(document.querySelector('.hello-world').textContent.trim(), '2018-05-31');
  });

  test('using an aliased module', async function (assert) {
    await render(hbs`{{import-sync}}`);
    assert.equal(document.querySelector('.aliased').textContent.trim(), 'innerlib2 loaded');
  });

  test('using a prefix match aliased module', async function (assert) {
    await render(hbs`{{import-sync}}`);
    assert.equal(document.querySelector('.prefix-aliased').textContent.trim(), 'deeper named');
  });

  test('using a scoped module', async function (assert) {
    await render(hbs`{{import-sync}}`);
    assert.equal(document.querySelector('.scoped').textContent.trim(), 'this-is-from-ef4-scoped');
  });

  test('using a compiled module import', async function (assert) {
    await render(hbs`{{import-sync}}`);
    assert.equal(document.querySelector('.module-dependency').textContent.trim(), 'module transpiled');
  });

  test('using a template string', async function (assert) {
    this.set('which', 'vanilla');
    await render(hbs`{{import-sync which=this.which}}`);
    assert.equal(document.querySelector('.flavor').textContent.trim(), 'vanilla');

    this.set('which', 'chocolate');
    await settled();
    assert.equal(document.querySelector('.flavor').textContent.trim(), 'chocolate');
  });
});
