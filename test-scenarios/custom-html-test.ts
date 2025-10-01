import { appScenarios } from './scenarios';
import { PreparedApp } from 'scenario-tester';
import QUnit from 'qunit';
import merge from 'lodash/merge';
const { module: Qmodule, test } = QUnit;

appScenarios
  .map('custom-html', project => {
    project.linkDependency('ember-auto-import', { baseDir: __dirname });
    project.linkDependency('webpack', { baseDir: __dirname });

    merge(project.files, {
      'ember-cli-build.js': `
        const EmberApp = require('ember-cli/lib/broccoli/ember-app');
        module.exports = function (defaults) {
          let app = new EmberApp(defaults, {
            autoImport: {
              insertScriptsAt: 'auto-import-scripts',
              webpack: {
                entry: {
                  'my-special-entrypoint': './lib/special.js',
                }
              }
            },
          });
          app.import('vendor/my-vendor.js');
          return app.toTree();
        };
      `,
      app: {
        'index.html': `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8" />
              <meta http-equiv="X-UA-Compatible" content="IE=edge" />
              <title>AppTemplate</title>
              <meta name="description" content="" />
              <meta name="viewport" content="width=device-width, initial-scale=1" />

              {{content-for "head"}}

              <link integrity="" rel="stylesheet" href="{{rootURL}}assets/vendor.css" />
              <link integrity="" rel="stylesheet" href="{{rootURL}}assets/@ef4/app-template.css" />

              {{content-for "head-footer"}}
            </head>
            <body>
              {{content-for "body"}}
              <auto-import-scripts entrypoint="my-special-entrypoint"></auto-import-scripts>
              <script src="{{rootURL}}assets/vendor.js"></script>
              <auto-import-scripts entrypoint="app"></auto-import-scripts>
              <script src="{{rootURL}}assets/@ef4/app-template.js"></script>

              {{content-for "body-footer"}}
            </body>
          </html>
        `,
        templates: {
          'application.hbs': `<div data-test="model">{{this.model.aDep}}</div> <div data-test="vendor">{{this.model.vendor}}</div>`,
        },
        routes: {
          'application.js': `
            import Route from '@ember/routing/route';
            import aDep from 'a-dependency';
            export default Route.extend({
              model() {
                return {
                  aDep: aDep(),
                  vendor: window.myVendorResult,
                }
              }
            });
          `,
        },
      },
      lib: {
        'special.js': `window.useMySpecialBundle = function() { return 'special bundle implementation is here' }`,
      },
      vendor: {
        'my-vendor.js': `window.myVendorResult = useMySpecialBundle()`,
      },
      tests: {
        'index.html': `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8" />
              <meta http-equiv="X-UA-Compatible" content="IE=edge" />
              <title>AppTemplate Tests</title>
              <meta name="description" content="" />
              <meta name="viewport" content="width=device-width, initial-scale=1" />

              {{content-for "head"}}
              {{content-for "test-head"}}

              <link rel="stylesheet" href="{{rootURL}}assets/vendor.css" />
              <link rel="stylesheet" href="{{rootURL}}assets/@ef4/app-template.css" />
              <link rel="stylesheet" href="{{rootURL}}assets/test-support.css" />


              {{content-for "head-footer"}}
              {{content-for "test-head-footer"}}
            </head>
            <body>
              {{content-for "body"}}
              {{content-for "test-body"}}

              <div id="qunit"></div>
              <div id="qunit-fixture">
                <div id="ember-testing-container">
                  <div id="ember-testing"></div>
                </div>
              </div>

              <script src="/testem.js" integrity=""></script>
              <auto-import-scripts entrypoint="my-special-entrypoint" data-custom="yes"></auto-import-scripts>
              <script src="{{rootURL}}assets/vendor.js"></script>
              <auto-import-scripts entrypoint="app"></auto-import-scripts>
              <script src="{{rootURL}}assets/test-support.js"></script>
              <auto-import-scripts entrypoint="tests"></auto-import-scripts>
              <script src="{{rootURL}}assets/@ef4/app-template.js"></script>
              <script src="{{rootURL}}assets/tests.js"></script>

              {{content-for "body-footer"}}
              {{content-for "test-body-footer"}}
            </body>
          </html>

        `,
        acceptance: {
          'index-test.js': `
            import { module, test } from 'qunit';
            import { visit, currentURL } from '@ember/test-helpers';
            import { setupApplicationTest } from 'ember-qunit';

            module('Acceptance | index', function(hooks) {
              setupApplicationTest(hooks);

              test('visit /', async function (assert) {
                await visit('/');
                assert.equal(currentURL(), '/');
                assert.equal(document.querySelector('[data-test="model"]').textContent.trim(), 'a-dep');
                assert.equal(document.querySelector('[data-test="vendor"]').textContent.trim(), 'special bundle implementation is here');
                assert.ok(document.querySelectorAll('[data-custom="yes"]').length > 0, 'found custom attribute');
              });
            });
          `,
        },
      },
    });
    project.addDevDependency('a-dependency', {
      files: {
        'index.js': `module.exports = function() { return 'a-dep'}`,
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
        let result = await app.execute('pnpm  run test');
        assert.equal(result.exitCode, 0, result.output);
      });
    });
  });
