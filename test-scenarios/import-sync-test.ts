import { appScenarios } from './scenarios';
import { PreparedApp } from 'scenario-tester';
import QUnit from 'qunit';
import merge from 'lodash/merge';
import { setupFastboot } from './fastboot-helper';
const { module: Qmodule, test } = QUnit;

appScenarios
  .map('import-sync', project => {
    project.linkDependency('ember-auto-import', { baseDir: __dirname });
    project.linkDependency('webpack', { baseDir: __dirname });
    project.linkDependency('ember-cli-fastboot', { baseDir: __dirname });
    project.linkDependency('@embroider/macros', { baseDir: __dirname });

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
        'router.js': `
          import EmberRouter from '@ember/routing/router';
          import config from './config/environment';

          const Router = EmberRouter.extend({
            location: config.locationType,
            rootURL: config.rootURL,
          });

          Router.map(function () {
            this.route('import-sync');
            this.route('import-sync-relative-template');
            this.route('import-sync-flavor', { path: '/flavor/:which' });
          });

          export default Router;

        `,
        templates: {
          'import-sync.hbs': `<div data-test="import-sync-result">{{this.model}}</div>`,
          'import-sync-relative-template.hbs': `<div data-test="import-sync-result">{{this.model.message}}</div>`,
          'import-sync-flavor.hbs': `<div data-test="import-sync-result">{{this.model.name}}</div>`,
        },
        routes: {
          'import-sync.js': `
            import Route from '@ember/routing/route';
            import { importSync } from '@embroider/macros';
            export default Route.extend({
              model() {
                return importSync('a-dependency').default();
              },
            });
          `,
          'import-sync-flavor.js':
            `
            import Route from '@ember/routing/route';
            import { importSync } from '@embroider/macros';
            export default Route.extend({
              model({ which }) {` +
            '   return importSync(`a-dependency/flavors/${which}`);' +
            ` },
            });
          `,
          'import-sync-relative-template.js':
            `
            import Route from '@ember/routing/route';
            import { importSync } from '@embroider/macros';
            export default Route.extend({
              model() {
                try {` +
            '     return importSync(`/a-dependency/${42}`); ' +
            `     throw new Error('you should not reach this point');
                } catch (err) {
                  return { message: err.message }
                }
              },
            });`
        },
      },
      tests: {
        acceptance: {
          'import-sync-test.js': `
            import { module, test } from 'qunit';
            import { visit, currentURL } from '@ember/test-helpers';
            import { setupApplicationTest } from 'ember-qunit';

            module('Acceptance | import-sync', function(hooks) {
              setupApplicationTest(hooks);

              test('import-sync', async function (assert) {
                await visit('/import-sync');
                assert.equal(currentURL(), '/import-sync');
                assert.equal(
                  document.querySelector('[data-test="import-sync-result"]').textContent.trim(),
                  'ember-auto-import-a-dependency'
                );
              });

              test('template import-sync', async function (assert) {
                await visit('/flavor/vanilla');
                assert.equal(currentURL(), '/flavor/vanilla');
                assert.equal(document.querySelector('[data-test="import-sync-result"]').textContent.trim(), 'vanilla');
              });

              test('import-sync relative template string import', async function (assert) {
                await visit('/import-sync-relative-template');
                assert.equal(currentURL(), '/import-sync-relative-template');
                assert.equal(
                  document.querySelector('[data-test="import-sync-result"]').textContent.trim(), ` +
            "'Could not find module `_eai_sync_/a-dependency/${e}` imported from `(require)`'" +
            `
                );
              })
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
        flavors: {
          'vanilla.js': `export const name = "vanilla";`,
          'chocolate.js': `export const name = "chocolate";`,
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

      test('npm run test', async function (assert) {
        let result = await app.execute('volta run npm -- run test');
        assert.equal(result.exitCode, 0, result.output);
      });

      Qmodule('fastboot', function (hooks) {
        let visit: any;
        hooks.before(async () => {
          ({ visit } = await setupFastboot(app));
        });

        test('import-sync string literal', async function (assert) {
          let document = (await visit('/import-sync')).window.document;
          assert.equal(
            document.querySelector('[data-test="import-sync-result"]').textContent.trim(),
            'ember-auto-import-a-dependency'
          );
        });

        test('import-sync template string', async function (assert) {
          let document = (await visit('/flavor/vanilla')).window.document;
          assert.equal(document.querySelector('[data-test="import-sync-result"]').textContent.trim(), 'vanilla');
        });
      });
    });
  });
