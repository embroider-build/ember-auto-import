import { appScenarios } from './scenarios';
import { PreparedApp, Project } from 'scenario-tester';
import QUnit from 'qunit';
import merge from 'lodash/merge';
import { setupFastboot } from './fastboot-helper';
const { module: Qmodule, test } = QUnit;

function customVendorTest(project: Project, vendorPath: string) {
  project.linkDependency('ember-auto-import', { baseDir: __dirname });
  project.linkDependency('ember-cli-fastboot', { baseDir: __dirname });

  merge(project.files, {
    'ember-cli-build.js': `
        const EmberApp = require('ember-cli/lib/broccoli/ember-app');
        module.exports = function (defaults) {
          let app = new EmberApp(defaults, {
            outputPaths: {
              vendor: {
                js: "${vendorPath}"
              }
            }
          });
          return app.toTree();
        };
      `,
    app: {
      'index.html': `
        <!DOCTYPE html>
        <html>
          <head>
            {{content-for "head"}}
            <link rel="stylesheet" href="/assets/vendor.css" />
            <link rel="stylesheet" href="/assets/@ef4/app-template.css" />
            {{content-for "head-footer"}}
          </head>
          <body>
            {{content-for "body"}}
            <script src="${vendorPath}"></script>
            <script src="/assets/@ef4/app-template.js"></script>
            {{content-for "body-footer"}}
          </body>
        </html>

      `,
      controllers: {
        'application.js': `
            import Controller from '@ember/controller';
            import { example } from 'some-lib';

            export default class extends Controller {
              result = example();
            }
          `,
      },
      templates: {
        'application.hbs': `
            <div data-test-result>{{this.result}}</div>
          `,
      },
    },
    tests: {
      'index.html': `
        <!DOCTYPE html>
        <html>
          <head>
            {{content-for "head"}}
            {{content-for "test-head"}}
            <link rel="stylesheet" href="/assets/vendor.css" />
            <link rel="stylesheet" href="/assets/@ef4/app-template.css" />
            <link rel="stylesheet" href="/assets/test-support.css" />
            {{content-for "head-footer"}}
            {{content-for "test-head-footer"}}
          </head>
          <body>
            {{content-for "body"}}
            {{content-for "test-body"}}
            <script src="/testem.js" integrity=""></script>
            <script src="${vendorPath}"></script>
            <script src="/assets/test-support.js"></script>
            <script src="/assets/@ef4/app-template.js"></script>
            <script src="/assets/tests.js"></script>
            {{content-for "body-footer"}}
            {{content-for "test-body-footer"}}
          </body>
        </html>
      `,
      acceptance: {
        'basic-test.js': `
            import { module, test } from 'qunit';
            import { visit } from '@ember/test-helpers';
            import { setupApplicationTest } from 'ember-qunit';

            module('Acceptance | basic', function(hooks) {
              setupApplicationTest(hooks);

              test('visiting /basic', async function(assert) {
                await visit('/');
                assert.equal(document.querySelector('[data-test-result]').textContent.trim(), 'it worked');
              });
            });
          `,
      },
    },
  });

  project.addDevDependency('some-lib', {
    files: {
      'index.js': `
          export function example() {
            return 'it worked';
          }
        `,
    },
  });
}

appScenarios
  // ember-cli 2.18 has bugs that don't let it actually work with customized
  // vendor paths. When we bump the lts scenario to something newer we can
  // drop this check.
  .skip('lts')
  .expand({
    'customized-vendor-nested': project => customVendorTest(project, '/js/vendor.js'),
    'customized-vendor-top': project => customVendorTest(project, '/top-level-vendor.js'),
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
    });
  });

appScenarios
  // ember-cli 2.18 has bugs that don't let it actually work with customized
  // vendor paths. When we bump the lts scenario to something newer we can
  // drop this check.
  .skip('lts')
  .map('customized-vendor-fastboot', project => {
    customVendorTest(project, '/js/vendor.js');
  })
  .forEachScenario(scenario => {
    Qmodule(scenario.name, function (hooks) {
      let visit: any;

      hooks.before(async () => {
        let app = await scenario.prepare();
        ({ visit } = await setupFastboot(app));
      });

      test('runs in fastboot', async function (assert) {
        let dom = await visit('/');
        let document = dom.window.document;
        assert.equal(document.querySelector('[data-test-result]').textContent.trim(), 'it worked');
      });
    });
  });
