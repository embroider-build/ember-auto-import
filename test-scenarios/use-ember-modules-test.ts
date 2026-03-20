import merge from 'lodash/merge';
import { appScenarios } from './scenarios';
import { PreparedApp } from 'scenario-tester';
import QUnit from 'qunit';
const { module: Qmodule, test } = QUnit;

let scenarios = appScenarios.only('release').map('use-ember-modules test', project => {
  // working around old ember-cli-htmlbars
  // project.linkDevDependency('tracked-built-ins', { baseDir: __dirname, resolveName: 'tracked-built-ins-4' });
  merge(project.files, {
    config: {
      'optional-features.json': `
        {
          "use-ember-modules": true,
          "application-template-wrapper": false,
          "default-async-observers": true,
          "jquery-integration": false,
          "template-only-glimmer-components": true
        }
      `,
    },
  });
});

scenarios.forEachScenario(scenario => {
  Qmodule(scenario.name, function (hooks) {
    let app: PreparedApp;
    hooks.before(async () => {
      app = await scenario.prepare();
    });
    test('pnpm run test', async function (assert) {
      let result = await app.execute('pnpm run test');
      assert.equal(result.exitCode, 0, result.output);
    });
  });
});
