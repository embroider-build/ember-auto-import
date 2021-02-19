import merge from 'lodash/merge';
import { appScenarios } from './scenarios';
import { PreparedApp } from '@ef4/test-support';
import QUnit from 'qunit';
const { module: Qmodule, test } = QUnit;

appScenarios
  .map('empty-app', project => {
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
  })
  .forEachScenario(scenario => {
    Qmodule(scenario.name, function (hooks) {
      let app: PreparedApp;
      hooks.before(async () => {
        app = await scenario.prepare();
      });
      test('yarn test', async function (assert) {
        let result = await app.execute('yarn test');
        assert.equal(result.exitCode, 0, result.output);
      });
    });
  });
