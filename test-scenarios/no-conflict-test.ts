import { appScenarios } from './scenarios';
import { PreparedApp, Project } from 'scenario-tester';
import QUnit from 'qunit';
import { dirname } from 'path';
import merge from 'lodash/merge';
const { module: Qmodule, test } = QUnit;

appScenarios
  .map('no-conflict', project => {
    project.linkDependency('ember-auto-import', { baseDir: __dirname });
    project.addDependency('inner-lib', '1.2.3');
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

    let addon = Project.fromDir(dirname(require.resolve('@ef4/addon-template/package.json')), { linkDeps: true });
    addon.linkDependency('ember-auto-import', { baseDir: __dirname });
    addon.addDependency('inner-lib', '1.2.3');
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
        let result = await app.execute('npm run build');
        assert.equal(result.exitCode, 0, result.output);
      });
    });
  });
