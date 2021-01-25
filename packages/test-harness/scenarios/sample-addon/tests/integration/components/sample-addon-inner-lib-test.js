import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render } from '@ember/test-helpers';
import hbs from 'htmlbars-inline-precompile';

module('Integration | Component | sample-addon-inner-lib', function (hooks) {
  setupRenderingTest(hooks);

  test('it locates inner-lib', async function (assert) {
    await render(hbs`{{sample-addon-inner-lib}}`);
    assert.equal(this.element.textContent.trim(), 'ember_auto_import_sample_lib');
  });
});
