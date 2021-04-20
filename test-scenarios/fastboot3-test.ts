import { baseApp } from './scenarios';
import { PreparedApp, Scenarios } from 'scenario-tester';
import QUnit from 'qunit';
import merge from 'lodash/merge';
import { launchFastboot } from './fastboot-helper';
import { readJSONSync, writeJSONSync } from 'fs-extra';
import { join } from 'path';
const { module: Qmodule, test } = QUnit;

/*
  This covers our compatibliity with fastboot schemaVersion 5. At the time of
  writing, no version of emer-cli-fastboot actually writes that format (only
  embroider does), but the ember-cli-fastboot 3 beta release we're testing here
  does contain a new-enough version of fastboot that can *read* the new manifest
  format.

  Once there is a released ember-cli-fastboot that writes schemaVersion 5, we
  should drop the hack in this test that writes it manually.
*/
function upgradeManifest(manifest: any) {
  if (manifest.schemaVersion !== 3) {
    throw new Error(`test expected to find fastboot schemaVersion 3`);
  }
  return {
    schemaVersion: 5,
    htmlEntrypoint: 'index.html',
  };
}

Scenarios.fromProject(baseApp)
  .map('fastboot3', project => {
    project.linkDependency('ember-auto-import', { baseDir: __dirname });
    project.linkDependency('ember-cli-fastboot', { baseDir: __dirname, resolveName: 'ember-cli-fastboot3' });

    merge(project.files, {
      'ember-cli-build.js': `
        const EmberApp = require('ember-cli/lib/broccoli/ember-app');
        module.exports = function (defaults) {
          let app = new EmberApp(defaults, {
            babel: {
              plugins: [
                require('ember-auto-import/babel-plugin')
              ],
            },
          });
          return app.toTree();
        };
      `,
      app: {
        templates: {
          'application.hbs': `<div data-test="dynamic-import-result">{{this.model.name}}</div>`,
        },
        routes: {
          'application.js': `
            import Route from '@ember/routing/route';
            export default Route.extend({
              model() {
                return import('a-dependency').then(module => {
                  return { result: module.default() };
                });
              },
            });
          `,
        },
      },
    });
    project.addDevDependency('a-dependency', {
      files: {
        'index.js': `
          module.exports = function() {
            return 'ember-auto-import-a-dependency';
          }`,
      },
    });
  })
  .expand({
    dev: () => {},
    prod: () => {},
  })
  .forEachScenario(scenario => {
    Qmodule(scenario.name, function (hooks) {
      let app: PreparedApp;
      let visit: any;
      hooks.before(async () => {
        app = await scenario.prepare();
        let environment = scenario.name.endsWith('prod') ? 'production' : 'development';
        let result = await app.execute(`node node_modules/ember-cli/bin/ember build --environment=${environment}`);
        if (result.exitCode !== 0) {
          throw new Error(`failed to build app for fastboot: ${result.output}`);
        }

        // HACK: upgrade the fastboot manifest format to v5 because no version
        // of ember-cli-fastboot does this yet, and we want to test our
        // compatibility with that format
        let pkg = readJSONSync(join(app.dir, 'package.json'));
        pkg.fastboot = upgradeManifest(pkg.fastboot);
        writeJSONSync(join(app.dir, 'package.json'), pkg);

        ({ visit } = await launchFastboot(app.dir));
      });

      test('dynamic string literal', async function (assert) {
        let document = (await visit('/')).window.document;
        assert.equal(
          document.querySelector('[data-test="dynamic-import-result"]').textContent.trim(),
          'ember-auto-import-a-dependency'
        );
      });
    });
  });
