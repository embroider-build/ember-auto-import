import merge from 'lodash/merge';
import { appScenarios } from './scenarios';
import { PreparedApp } from 'scenario-tester';
import QUnit from 'qunit';
const { module: Qmodule, test } = QUnit;

let scenarios = appScenarios.only('release').map('smoke-test', project => {
  /**
   * We had an issue when @glimmer/component upgraded to be a v2 addon, it wasn't discoverable as an implicit
   * dependency of other v2 addons. This is a simple bug since we expect all addons to have access to this
   * dependency without having to declare it as a peerDep
   */
  project.linkDevDependency('@glimmer/component', { baseDir: __dirname, resolveName: 'glimmer-component-2' });
  project.linkDevDependency('ember-welcome-page', { baseDir: __dirname, resolveName: 'ember-welcome-page8' });

  merge(project.files, {
    tests: {
      acceptance: {
        'index-test.js': `
            import { module, test } from 'qunit';
            import { visit } from '@ember/test-helpers';
            import { setupApplicationTest } from 'ember-qunit';
            module('Acceptance | index', function (hooks) {
              setupApplicationTest(hooks);
              test('Renders the Welcome Page', async function (assert) {
                await visit('/');
                assert.equal(document.querySelector('#ember-testing h1').textContent.trim(), 'Congratulations, you made it!');
              });
            });
          `,
      },
    },
  });

  project.linkDependency('ember-auto-import', { baseDir: __dirname });
  project.linkDependency('webpack', { baseDir: __dirname });
});

scenarios.forEachScenario(scenario => {
  Qmodule(scenario.name, function (hooks) {
    let app: PreparedApp;
    hooks.before(async () => {
      app = await scenario.prepare();
    });
    test('yarn test', async function (assert) {
      let result = await app.execute('pnpm  run test');
      assert.equal(result.exitCode, 0, result.output);
    });
  });
});
