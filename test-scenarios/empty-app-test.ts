import { join } from 'path';
import merge from 'lodash/merge';
import { testApp } from '@ef4/test-support';

testApp('empty app', join(__dirname, '..', 'app-template'), function ({ setup, test }) {
  setup(async function (project) {
    merge(project.files, {
      app: {
        templates: {
          'application.hbs': '<h1 data-test="basic">test setup is working</h1>',
        },
      },
      tests: {
        acceptance: {
          'basic-test.js': `
            import { module, test } from 'qunit';
            import { visit } from '@ember/test-helpers';
            import { setupApplicationTest } from 'ember-qunit';

            module('Acceptance | basic', function(hooks) {
              setupApplicationTest(hooks);

              test('visiting /', async function(assert) {
                await visit('/');
                assert.equal(document.querySelector('[data-test="basic"]').textContent.trim(), 'test setup is working');
              });
            });
          `,
        },
      },
    });
  });

  test('ember test', async function (assert, app) {
    let { exitCode } = await app.execute('test');
    assert.equal(exitCode, 0);
  });
});
