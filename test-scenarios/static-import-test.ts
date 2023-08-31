import { appScenarios } from './scenarios';
import { PreparedApp, Project } from 'scenario-tester';
import QUnit from 'qunit';
import merge from 'lodash/merge';
import { setupFastboot } from './fastboot-helper';
const { module: Qmodule, test } = QUnit;

function staticImportTest(project: Project) {
  project.linkDependency('ember-auto-import', { baseDir: __dirname });
  project.linkDependency('webpack', { baseDir: __dirname });
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
              },
              watchDependencies: [
               'original-package'
              ],
              allowAppImports: [
               'lib/**'
              ]
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
                  // hiding from webpack
                  let r = "r" + "equire";
                  window[r]('lodash-es');
                  return true;
                } catch (err) {
                  return false;
                }
              }),
            });
          `,
      },
      lib: {
        'example1.js': 'export default function() { return "example1 worked" }',
        'example2.js': `
          export { default as Service } from '@ember/service';
          export { default as example4, dont_find_me_4 } from './example4.js';
          export { default as example5 } from '@ef4/app-template/lib/example5.js';
          // this will be externalised to amd and you cannont use an extension in this context :(
          export { default as example6 } from '@ef4/app-template/utils/example6';
          export { default as example7, secret_string as secret_string_7 } from '../utils/example7';

          export default function () {
            return 'example2 worked';
          }
          export let please_find_me =
            'a761ae81ea95881286817847d330e50f0971b6bb06be850d4e1172bc72e75526';

        `,
        'example3.js': 'export default function() { return "example3 worked" }',
        'example4.js': `export default function () {
            return 'example4 worked';
          }
          export const dont_find_me_4 = "don't find this string in the bundle";
        `,
        'example5.js': 'export default function() { return "example5 worked" }',
      },
      utils: {
        'example6.js':
          'export default function() { return "example6 worked" }; export let dont_find_me = "2634a160bb3d83eae65ffd576f383dc35f77d6577402220d6f19e2eeea7e328a";',
        'example7.js':
          'export default function() { return "example7 worked" }; export let secret_string = "95c34c842bd06504a541559d0ebf104e0a135f9ebc42c7a9bbf99b70dd6a5c96";',
      },
      templates: {
        'application.hbs': `{{hello-world}}`,
        components: {
          'hello-world.hbs': `
              <div class="hello-world">{{this.formattedDate}}</div>
              <div class="lodash">{{#if this.lodashPresent}}yes{{else}}no{{/if}}</div>
              <div class="aliased">{{this.aliasedResult}}</div>
              <div class="scoped">{{this.fromScoped}}</div>
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
        'allow-app-imports-test.js': `
          import { module, test } from 'qunit';
          import example1 from '@ef4/app-template/lib/example1';
          import example2, {
            Service as AppService,
            example4,
            example5,
            example6,
            example7,
            please_find_me,
            dont_find_me_4,
            secret_string_7
          } from '../../lib/example2';
          import Service from '@ember/service';
          import example6Direct, { dont_find_me } from '@ef4/app-template/utils/example6';
          import example7Direct, { secret_string } from '@ef4/app-template/utils/example7';

          async function checkScripts(scriptSrcPattern, needle) {
            let scripts = [...document.querySelectorAll('script')];

            let matchingScripts = scripts.filter((item) =>
              scriptSrcPattern.test(item.src)
            );

            let matchingScriptContent = await Promise.all(
              matchingScripts.map(async (item) => {
                let response = await fetch(item.src);
                return response.text();
              })
            );

            return matchingScriptContent.some((item) => item.includes(needle));
          }

          module('Unit | allow-app-import', function () {
            test("importing from the app's module namespace", function (assert) {
              assert.equal(example1(), 'example1 worked');
            });
            test('relative import', function (assert) {
              assert.equal(example2(), 'example2 worked');
            });
            test('imported module can see ember modules', function (assert) {
              assert.strictEqual(AppService, Service);
            });
            test('local imports work and do not show up in AMD loader', async function (assert) {
              assert.equal(example4(), 'example4 worked');
              assert.equal(
                require.has('@ef4/app-template/lib/example4'),
                false,
                'should not have example4 in loader'
              );
              assert.notOk(
                await checkScripts(/app-template.js/, dont_find_me_4),
                "expect to not find the 'dont_find_me_4' sha in app-js because it's being consumed by webpack"
              );
              assert.ok(
                await checkScripts(/chunk/, dont_find_me_4),
                "expect to find the 'dont_find_me_4' sha in chunks because it's being consumed by webpack"
              );
            });
            test('local app-name appImports work and do not show up in AMD loader', function (assert) {
              assert.equal(example5(), 'example5 worked');
              assert.equal(
                require.has('@ef4/app-template/lib/example5'),
                false,
                'should not have example5 in loader'
              );
            });
            test('local app-name imports outside of appImports work and do show up in AMD loader', function (assert) {
              assert.equal(example6(), 'example6 worked');
              assert.ok(
                require.has('@ef4/app-template/utils/example6'),
                'should have example6 in loader'
              );
              assert.strictEqual(example6, example6Direct);
            });
            test('local relative imports to files outside of appImports work and do show up in AMD loader', async function (assert) {
              assert.equal(example7(), 'example7 worked');
              assert.ok(
                require.has('@ef4/app-template/utils/example7'),
                'should have example7 in loader'
              );
              assert.strictEqual(example7, example7Direct, "example 7 object equality");
              assert.notOk(
                await checkScripts(/chunk/, secret_string_7),
                "expect not to find the 'secret_string_7' sha in chunks"
              );
              assert.ok(
                await checkScripts(/app-template.js/, secret_string_7),
                "expect to find the 'secret_string_7' sha in app js asset"
              );
            });
            test('make sure externalised import doesnt end up in the chunks', async function (assert) {
              assert.ok(
                await checkScripts(/chunk/, please_find_me),
                "expect to find the 'please_find_me' sha in chunks"
              );
              assert.notOk(
                await checkScripts(/chunk/, dont_find_me),
                "expect to not find the 'dont_find_me' sha in chunks because it's not being consumed by webpack"
              );
            });
            test('unused module not visible in AMD loader', function (assert) {
              assert.equal(
                require.has('@ef4/app-template/lib/example3'),
                false,
                'should not have example3 in loader'
              );
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
      let result = await app.execute('volta run npm -- run test');
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
