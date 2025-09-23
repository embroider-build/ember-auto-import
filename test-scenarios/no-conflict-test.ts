import { appScenarios, baseAddon } from './scenarios';
import { PreparedApp } from 'scenario-tester';
import QUnit from 'qunit';
import merge from 'lodash/merge';
const { module: Qmodule, test } = QUnit;

appScenarios
  .map('no-conflict', project => {
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
    addon.addDependency('inner-lib', '1.3.4', { requestedRange: '^1.0.0' });
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
      test('ensure build succeeds', async function (assert) {
        let result = await app.execute('pnpm  run build');
        assert.equal(result.exitCode, 0, result.output);
      });
    });
  });
