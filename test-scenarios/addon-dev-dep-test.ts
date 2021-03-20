import { addonScenarios } from './scenarios';
import { PreparedApp } from '@ef4/test-support';
import QUnit from 'qunit';
import merge from 'lodash/merge';
const { module: Qmodule, test } = QUnit;

addonScenarios
  .map('addon-dev-dep', project => {
    project.linkDependency('ember-auto-import', { baseDir: __dirname });
    project.addDevDependency('some-lib');
    merge(project.files, {
      addon: {
        'index.js': `
          import someLib from 'some-lib';
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
        let result = await app.execute('npm run build');
        assert.equal(result.exitCode, 1, result.output);
        assert.ok(
          /@ef4\/addon-template tried to import \"some-lib\" from addon code, but \"some-lib\" is a devDependency/.test(
            result.stderr
          ),
          result.stderr
        );
      });
    });
  });
