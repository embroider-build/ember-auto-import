import { appScenarios } from './scenarios';
import { PreparedApp, Project } from 'scenario-tester';
import QUnit from 'qunit';
import merge from 'lodash/merge';
import { setupFastboot } from './fastboot-helper';
const { module: Qmodule, test } = QUnit;

function staticImportTest(project: Project) {
  project.linkDependency('ember-auto-import', { baseDir: __dirname });
  project.linkDependency('ember-cli-fastboot', { baseDir: __dirname });
  project.linkDependency('moment', { baseDir: __dirname });
  project.linkDependency('lodash-es', { baseDir: __dirname });

  merge(project.files, {
    'ember-cli-build.js': `
        const EmberApp = require('ember-cli/lib/broccoli/ember-app');
        module.exports = function (defaults) {
          let app = new EmberApp(defaults, {
            autoImport: {
              alias: {
                'my-aliased-package': 'original-package'
              }
            }
          });
          return app.toTree();
        };
      `,
    app: {
      'reexport.js': `
          export { default as innerLib } from 'inner-lib';
        `,
      components: {
        'hello-world.js': `
            import Component from '@ember/component';
            import moment from 'moment';
            import { computed } from '@ember/object';
            import myAliased from 'my-aliased-package';
            import fromScoped from '@ef4/scoped-lib';

            export default Component.extend({
              formattedDate: computed(function () {
                return moment('2018-05-31T18:03:01.791Z').format('YYYY-MM-DD');
              }),

              aliasedResult: computed(function () {
                return myAliased();
              }),

              fromScoped: computed(function () {
                return fromScoped();
              }),

              // Our test suite imports lodash-es, but our app does not, so it
              // should not be present when we view the app outside the tests
              // (which we will check via a fastboot test below)
              lodashPresent: computed(function () {
                try {
                  window.require('lodash-es');
                  return true;
                } catch (err) {
                  return false;
                }
              }),
            });
          `,
      },
      templates: {
        'application.hbs': `{{hello-world}}`,
        components: {
          'hello-world.hbs': `
              <div class="hello-world">{{formattedDate}}</div>
              <div class="lodash">{{#if lodashPresent}}yes{{else}}no{{/if}}</div>
              <div class="aliased">{{aliasedResult}}</div>
              <div class="scoped">{{fromScoped}}</div>
            `,
        },
      },
    },
    tests: {
      integration: {
        components: {
          'hello-world-test.js': `
              import { module, test } from 'qunit';
              import { setupRenderingTest } from 'ember-qunit';
              import { render } from '@ember/test-helpers';
              import hbs from 'htmlbars-inline-precompile';

              module('Integration | Component | hello-world', function (hooks) {
                setupRenderingTest(hooks);

                test('using an auto-loaded module from app code', async function (assert) {
                  await render(hbs('{{hello-world}}'));
                  assert.equal(document.querySelector('.hello-world').textContent.trim(), '2018-05-31');
                });

                test('using an aliased module', async function (assert) {
                  await render(hbs('{{hello-world}}'));
                  assert.equal(document.querySelector('.aliased').textContent.trim(), 'original-package');
                });

                test('using a scoped module', async function (assert) {
                  await render(hbs('{{hello-world}}'));
                  assert.equal(document.querySelector('.scoped').textContent.trim(), 'this-is-from-ef4-scoped');
                });
              });
            `,
        },
      },
      unit: {
        'reexport-test.js': `
            import { module, test } from 'qunit';
            import { innerLib } from '@ef4/app-template/reexport';

            module('Unit | reexports are found', function () {
              test('can use inner lib', function (assert) {
                assert.equal(innerLib(), 'this-is-from-inner-lib');
              });
            });
          `,
        'import-into-tests-test.js': `
            import { module, test } from 'qunit';
            import { capitalize } from 'lodash-es';

            module('Unit | import-into-tests', function () {
              test('using an auto-loaded module from test code', function (assert) {
                assert.equal(capitalize('hello'), 'Hello');
              });
            });
          `,
      },
    },
  });

  project.addDevDependency('original-package', {
    files: {
      'index.js': `
          module.exports = function() {
            return 'original-package';
          }`,
    },
  });

  project.addDevDependency('@ef4/scoped-lib', {
    files: {
      'index.js': `
          module.exports = function() {
            return 'this-is-from-ef4-scoped';
          }`,
    },
  });

  project.addDevDependency('inner-lib', {
    files: {
      'index.js': `
          module.exports = function() {
            return 'this-is-from-inner-lib';
          }`,
    },
  });
}

let scenarios = appScenarios.map('static-import', project => {
  staticImportTest(project);
});

scenarios.forEachScenario(scenario => {
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

scenarios
  .expand({
    'fastboot dev': () => {},
    'fastboot prod': () => {},
  })
  .forEachScenario(scenario => {
    Qmodule(scenario.name, function (hooks) {
      let visit: any;

      hooks.before(async () => {
        ({ visit } = await setupFastboot(
          await scenario.prepare(),
          scenario.name.endsWith('prod') ? 'production' : 'development'
        ));
      });

      test('no test deps in app', async function (assert) {
        let dom = await visit('/');
        let document = dom.window.document;
        assert.equal(document.querySelector('.lodash').textContent.trim(), 'no', 'expected lodash to not be present');
      });

      test('app deps in app', async function (assert) {
        let dom = await visit('/');
        let document = dom.window.document;
        assert.equal(
          document.querySelector('.hello-world').textContent.trim(),
          '2018-05-31',
          'expected moment to work'
        );
      });
    });
  });
