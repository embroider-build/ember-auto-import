import { appScenarios, baseAddon } from './scenarios';
import { PreparedApp } from 'scenario-tester';
import QUnit from 'qunit';
import merge from 'lodash/merge';
const { module: Qmodule, test } = QUnit;

appScenarios
  .map('conflict', project => {
    project.linkDependency('ember-auto-import', { baseDir: __dirname });
    project.linkDependency('webpack', { baseDir: __dirname });

    project.addDependency('inner-lib', '1.2.3', { requestedRange: '^1.0.0' });
    merge(project.files, {
      app: {
        'app.js': `
          import innerLib from 'inner-lib';
          export function x() {
            return innerLib();
          }
        `,
      },
    });

    let addon = baseAddon();
    addon.linkDependency('ember-auto-import', { baseDir: __dirname });
    addon.addDependency('inner-lib', '2.3.4', { requestedRange: '^2.0.0' });
    merge(addon.files, {
      addon: {
        'index.js': `
          import innerLib from 'inner-lib';
          export function x() {
            return innerLib();
          }
        `,
      },
    });

    project.addDependency(addon);
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
          /@ef4\/app-template needs inner-lib satisfying \^1.0.0, but we have version 2.3.4 because of @ef4\/addon-template/.test(
            result.stderr
          ),
          result.stderr
        );
      });
    });
  });
