import { appScenarios } from './scenarios';
import { PreparedApp } from 'scenario-tester';
import QUnit from 'qunit';
import merge from 'lodash/merge';
import { setupFastboot } from './fastboot-helper';
import { CHECK_SCRIPTS_MODULE } from './static-import-test';

const { module: Qmodule, test } = QUnit;

appScenarios
  .map('dynamic-import', project => {
    project.linkDependency('ember-auto-import', { baseDir: __dirname });
    project.linkDependency('webpack', { baseDir: __dirname });
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
            autoImport: {
              allowAppImports: [
               'lib/**'
              ]
            }
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
        lib: {
          'example1.js':
            'export default function() { return "example1 worked" }; export const NO_FIND = "please dont look at this string"',
          'example2.js':
            'export default function() { return "example2 worked" }; export const NO_FIND = "this string should be hidden"',
          'example3.js':
            'export default function() { return "example3 worked" }; export const NO_FIND = "string or not to string"',
          'example4.js':
            'export default function() { return "example4 worked" }; export const NO_FIND = "please look away"',
        },
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
        helpers: {
          'check-scripts.js': CHECK_SCRIPTS_MODULE,
        },
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
        unit: {
          'allow-app-imports-test.js': `
            import { module, test } from 'qunit';
            import checkScripts from '../helpers/check-scripts';

            module('Unit | allow-app-import', function () {
              test("check scripts smoke test", async function(assert) {
                assert.ok(
                  await checkScripts(/(app-template|tests)\.js/, "checkscripts can see this line (woah)"),
                  "make sure that check scripts is able to see code in the tests asset"
                );
              })
              test("importing from the app's module namespace", async function (assert) {
                let { default: example1, NO_FIND } = await import('@ef4/app-template/lib/example1');
                assert.equal(example1(), 'example1 worked');
                assert.notOk(
                  await checkScripts(/(app-template|tests)\.js/, NO_FIND),
                  "expect to not find the 'example1 NO_FIND' in app-js because it's being consumed by webpack"
                );
                // we can't test the positive side here because webpack is dynamically adding and then removing
                // the script on us, and the timing is not reliable enough for us to check it while it exists
              });
              test("relative import", async function (assert) {
                let { default: example2, NO_FIND } = await import('../../lib/example2');
                assert.equal(example2(), 'example2 worked');
                assert.notOk(
                  await checkScripts(/(app-template|tests)\.js/, NO_FIND),
                  "expect to not find the 'example2 NO_FIND' in app-js because it's being consumed by webpack"
                );
              });
              test("importing from the app's module namespace with a template string", async function (assert) {
                const whichExample = 'example3'
                let { default: example3, NO_FIND } = await import(\`@ef4/app-template/lib/\${whichExample}\`);
                assert.equal(example3(), 'example3 worked');
                assert.notOk(
                  await checkScripts(/(app-template|tests)\.js/, NO_FIND),
                  "expect to not find the 'example3 NO_FIND' in app-js because it's being consumed by webpack"
                );
              })
              test("relative import with a template string", async function (assert) {
                const whichExample = 'example4'
                let { default: example4, NO_FIND } = await import(\`../../lib/\${whichExample}\`);
                assert.equal(example4(), 'example4 worked');
                assert.notOk(
                  await checkScripts(/(app-template|tests)\.js/, NO_FIND),
                  "expect to not find the 'example4 NO_FIND' in app-js because it's being consumed by webpack"
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
