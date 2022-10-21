import { appScenarios } from './scenarios';
import { PreparedApp } from 'scenario-tester';
import QUnit from 'qunit';
import merge from 'lodash/merge';
const { module: Qmodule, test } = QUnit;

appScenarios
  .map('static-import-build-error', project => {
    project.linkDependency('ember-auto-import', { baseDir: __dirname });
    project.linkDependency('webpack', { baseDir: __dirname });
    project.addDependency('@apollo/client', '3.7.0', { requestedRange: '^3.7.0' });
    merge(project.files, {
      app: {
        'app.js': `
          import nonexistentApolloClient from '@apollo/client/doesntexist';
          window.apolloClient = nonexistentApolloClient;
        `,
      },
    });
  })
  .forEachScenario(scenario => {
    Qmodule(scenario.name, function (hooks) {
      let app: PreparedApp;
      hooks.before(async () => {
        app = await scenario.prepare();
      });
      test('ensure build error', async function (assert) {
        let result = await app.execute('volta run npm -- run build');
        assert.notEqual(result.exitCode, 0, result.output);
        assert.ok(
          /Module not found: Error: Can\'t resolve \'@apollo\/client\/doesntexist/.test(result.output),
          result.output
        );
      });
    });
  });
