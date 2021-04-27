import merge from 'lodash/merge';
import { baseApp } from './scenarios';
import { PreparedApp, Scenarios } from 'scenario-tester';
import QUnit from 'qunit';
const { module: Qmodule, test } = QUnit;

Scenarios.fromProject(baseApp)
  .map('browser-targets', project => {
    project.addDevDependency('needs-babel', {
      files: {
        'index.js': `
        function returnUndefined() {
          // this should throw an error unless it's been transpiled
          return foo;
          let foo = 123;
        }

        export default function aModuleDependency() {
          try {
            if (returnUndefined() === undefined) {
              return 'let was transpiled';
            }
          } catch (e) {
            return 'let was not transpiled';
          }
        }`,
      },
    });
    project.linkDevDependency('ember-auto-import', { baseDir: __dirname });
    project.linkDependency('webpack', { baseDir: __dirname });
  })
  .expand({
    transpiled: project => {
      merge(project.files, {
        'testem.js': `
          module.exports = {
            test_page: 'tests/index.html?hidepassed',
            disable_watching: true,
            launch_in_ci: [
              "${process.platform === 'win32' ? 'IE' : 'Chrome'}"
            ],
            launch_in_dev: [
              'Chrome'
            ],
            browser_args: {
              Chrome: {
                ci: [
                  // --no-sandbox is needed when running Chrome inside a container
                  process.env.CI ? '--no-sandbox' : null,
                  '--headless',
                  '--disable-dev-shm-usage',
                  '--disable-software-rasterizer',
                  '--mute-audio',
                  '--remote-debugging-port=0',
                  '--window-size=1440,900'
                ].filter(Boolean)
              }
            }
          };
        `,
        config: {
          'targets.js': `
            module.exports = {
              browsers: ['ie 11']
            };
          `,
        },
        tests: {
          unit: {
            'basic-test.js': `
              import { module, test } from 'qunit';
              import needsBabel from 'needs-babel';
              module('Unit | basic', function() {
                test('dependency was transpiled to match our targets', async function(assert) {
                  assert.equal(needsBabel(), 'let was transpiled');
                });
              });
            `,
          },
        },
      });
    },
    untranspiled: project => {
      merge(project.files, {
        config: {
          'targets.js': `
            module.exports = {
              browsers: 'last 1 Chrome versions'
            };
          `,
        },
        tests: {
          unit: {
            'basic-test.js': `
              import { module, test } from 'qunit';
              import needsBabel from 'needs-babel';
              module('Unit | basic', function() {
                test('dependency was transpiled to match our targets', async function(assert) {
                  assert.equal(needsBabel(), 'let was not transpiled');
                });
              });
            `,
          },
        },
      });
    },
  })
  .forEachScenario(scenario => {
    Qmodule(scenario.name, function (hooks) {
      let app: PreparedApp;
      hooks.before(async () => {
        app = await scenario.prepare();
      });
      test('yarn test', async function (assert) {
        let result = await app.execute('npm run test');
        assert.equal(result.exitCode, 0, result.output);
      });
    });
  });
