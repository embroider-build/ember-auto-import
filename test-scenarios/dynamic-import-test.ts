import { appScenarios } from './scenarios';
import { PreparedApp } from 'scenario-tester';
import QUnit from 'qunit';
import merge from 'lodash/merge';
import { setupFastboot } from './fastboot-helper';
const { module: Qmodule, test } = QUnit;

appScenarios
  .map('dynamic-import', project => {
    project.linkDependency('ember-auto-import', { baseDir: __dirname });
    project.linkDependency('ember-cli-fastboot', { baseDir: __dirname });

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
            this.route('dynamic-import');
            this.route('dynamic-flavor', { path: '/flavor/:which' });
            this.route('native-import');
            this.route('data-import');
          });

          export default Router;

        `,
        templates: {
          'dynamic-import.hbs': `<div data-test="dynamic-import-result">{{this.model.result}}</div>`,
          'dynamic-flavor.hbs': `<div data-test="dynamic-import-result">{{this.model.name}}</div>`,
          'native-import.hbs': `<div data-test="dynamic-import-result">{{this.model.name}}</div>`,
          'data-import.hbs': `<div data-test="dynamic-import-result">{{this.model.name}}</div>`,
        },
        routes: {
          'dynamic-import.js': `
            import Route from '@ember/routing/route';
            export default Route.extend({
              model() {
                return import('a-dependency').then(module => {
                  return { result: module.default() };
                });
              },
            });
          `,
          'dynamic-flavor.js':
            `
            import Route from '@ember/routing/route';
            export default Route.extend({
              model({ which }) {` +
            '   return import(`a-dependency/flavors/${which}`);' +
            ` },
            });
          `,
          'native-import.js':
            `
            import Route from '@ember/routing/route';
            export default Route.extend({
              model() {
                if (typeof FastBoot == 'undefined') {` +
            '      return import(`//${window.location.host}/my-target.js`);' +
            `    } else {
                  return { name: 'server' };
                }
              },
            });`,
          'data-import.js':
            `import Route from '@ember/routing/route';` +
            `export default Route.extend({` +
            `  model() {` +
            `    if (typeof FastBoot == 'undefined') {` +
            '      return import(`data:application/javascript;base64,${btoa(\'export const name = "browser"\')}`);' +
            `    } else {` +
            `      return { name: 'server' };` +
            '    }}});',
        },
      },
      public: {
        'my-target.js': `export const name = 'browser';`,
      },
      tests: {
        acceptance: {
          'dynamic-import-test.js': `
            import { module, test } from 'qunit';
            import { visit, currentURL } from '@ember/test-helpers';
            import { setupApplicationTest } from 'ember-qunit';

            module('Acceptance | dynamic-import', function(hooks) {
              setupApplicationTest(hooks);

              test('dynamic-import', async function (assert) {
                await visit('/dynamic-import');
                assert.equal(currentURL(), '/dynamic-import');
                assert.equal(
                  document.querySelector('[data-test="dynamic-import-result"]').textContent.trim(),
                  'ember-auto-import-a-dependency'
                );
              });

              test('template dynamic-import', async function (assert) {
                await visit('/flavor/vanilla');
                assert.equal(currentURL(), '/flavor/vanilla');
                assert.equal(document.querySelector('[data-test="dynamic-import-result"]').textContent.trim(), 'vanilla');
              });

              test('browser can use native import', async function (assert) {
                await visit('/native-import');
                assert.equal(currentURL(), '/native-import');
                let expected = typeof FastBoot === 'undefined' ? 'browser' : 'server';
                assert.equal(document.querySelector('[data-test="dynamic-import-result"]').textContent.trim(), expected);
              });

              test('browser can use native import of data uri', async function (assert) {
                await visit('/data-import');
                assert.equal(currentURL(), '/data-import');
                let expected = typeof FastBoot === 'undefined' ? 'browser' : 'server';
                assert.equal(document.querySelector('[data-test="dynamic-import-result"]').textContent.trim(), expected);
              });
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
        let result = await app.execute('npm run test');
        assert.equal(result.exitCode, 0, result.output);
      });

      Qmodule('fastboot', function (hooks) {
        let visit: any;
        hooks.before(async () => {
          ({ visit } = await setupFastboot(app));
        });

        test('dynamic string literal', async function (assert) {
          let document = (await visit('/dynamic-import')).window.document;
          assert.equal(
            document.querySelector('[data-test="dynamic-import-result"]').textContent.trim(),
            'ember-auto-import-a-dependency'
          );
        });

        test('dynamic template string', async function (assert) {
          let document = (await visit('/flavor/vanilla')).window.document;
          assert.equal(document.querySelector('[data-test="dynamic-import-result"]').textContent.trim(), 'vanilla');
        });
      });
    });
  });
