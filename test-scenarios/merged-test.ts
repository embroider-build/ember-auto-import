import { appScenarios, baseAddon } from './scenarios';
import { PreparedApp } from 'scenario-tester';
import QUnit from 'qunit';
import merge from 'lodash/merge';
const { module: Qmodule, test } = QUnit;

appScenarios
  .skip('lts') // webpack will duplicate the inner module when ember-welcome-page is on v5
  .map('merged', project => {
    let innerLib = project.addDevDependency('inner-lib', {
      files: {
        'index.js': `
          module.exports = function() {
            return 'ember_auto_import_sample_lib';
          }
        `,
        'data.txt': `This is some sample data`,
      },
    });

    let innerLib2 = project.addDevDependency('inner-lib2', {
      files: {
        'index.js': `
          const named = require('./named');
          module.exports = function() {
            named();
            return 'innerlib2 loaded';
          }
        `,
        'named.js': `
          module.exports = function() {
            return 'ember_auto_import_inner_lib2_named';
          }
        `,
        deeper: {
          'index.js': `
            module.exports = function() {
              return 'deeper index';
            }
          `,
          'named.js': `
            module.exports = function() {
              return 'deeper named';
            }
          `,
        },
      },
    });

    let addon = baseAddon();
    addon.addDependency(innerLib.clone());
    addon.addDependency(innerLib2.clone());
    addon.linkDependency('ember-auto-import', { baseDir: __dirname });

    merge(addon.files, {
      addon: {
        components: {
          'sample-addon-inner-lib.js': `
            import Component from '@ember/component';
            import layout from '../templates/components/sample-addon-inner-lib';
            import innerLib from 'inner-lib';
            import { computed } from '@ember/object';

            export default Component.extend({
              layout,
              message: computed(function () {
                return innerLib();
              }),
            });
          `,
        },
        templates: {
          components: {
            'sample-addon-inner-lib.hbs': `
              <div data-test="sample-addon-inner-lib">{{this.message}}</div>
            `,
          },
        },
      },
      app: {
        components: {
          'sample-addon-inner-lib.js': `
            export { default } from '@ef4/addon-template/components/sample-addon-inner-lib';
          `,
        },
      },
    });

    project.addDevDependency(addon);
    project.linkDependency('ember-auto-import', { baseDir: __dirname });
    project.linkDependency('webpack', { baseDir: __dirname });

    project
      .addDevDependency('custom-loader', {
        files: {
          'index.js': `
        let escape = require('js-string-escape');
        module.exports = function(src) {
          return "export const value = 'custom-loader-worked: " + escape(src) + "';";
        }
      `,
        },
      })
      .linkDependency('js-string-escape', { baseDir: __dirname });

    merge(project.files, {
      'ember-cli-build.js': `
        const EmberApp = require('ember-cli/lib/broccoli/ember-app');
        module.exports = function (defaults) {
          let app = new EmberApp(defaults, {
            autoImport: {
              webpack: {
                module: {
                  rules: [
                    {
                      test: /data\.txt$/,
                      use: ["custom-loader"]
                    },
                  ],
                },
              }
            }
          });
          return app.toTree();
        };
      `,
      app: {
        controllers: {
          'index.js': `
            import Controller from '@ember/controller';
            import innerLib from 'inner-lib';
            import innerLib2 from 'inner-lib2';
            import innerLib2Named from 'inner-lib2/named';

            export default Controller.extend({
              ownInnerLib: innerLib(),
              ownInnerLib2: innerLib2(),
              ownInnerLib2Named: innerLib2Named(),
            });
          `,
        },
        templates: {
          'index.hbs': `
            <div data-test="own-inner-lib">{{this.ownInnerLib}}</div>
            <div data-test="own-inner-lib2">{{this.ownInnerLib2}}</div>
            <div data-test="own-inner-lib2-named">{{this.ownInnerLib2Named}}</div>
            {{sample-addon-inner-lib}}
          `,
        },
      },
      tests: {
        acceptance: {
          'basic-test.js': `
            import { module, test } from 'qunit';
            import { visit } from '@ember/test-helpers';
            import { setupApplicationTest } from 'ember-qunit';

            module('Acceptance | basic', function(hooks) {
              setupApplicationTest(hooks);

              test('innerLib works directly', async function(assert) {
                await visit('/');
                assert.equal(document.querySelector('[data-test="own-inner-lib"]').textContent.trim(), 'ember_auto_import_sample_lib');
              });

              test('innerLib works in addon', async function(assert) {
                await visit('/');
                assert.equal(document.querySelector('[data-test="sample-addon-inner-lib"]').textContent.trim(), 'ember_auto_import_sample_lib');
              });

              test('innerLib2 works', async function(assert) {
                await visit('/');
                assert.equal(document.querySelector('[data-test="own-inner-lib2"]').textContent.trim(), 'innerlib2 loaded');
              });

              test('innerLib2Named works', async function(assert) {
                await visit('/');
                assert.equal(document.querySelector('[data-test="own-inner-lib2-named"]').textContent.trim(), 'ember_auto_import_inner_lib2_named');
              });

            });
          `,
        },
        unit: {
          'loader-test.js': `
            import { module, test } from 'qunit';
            import { value } from 'inner-lib/data.txt';
            module('Unit | loader-test', function() {
              test('the app can use a custom webpack loader', async function(assert) {
                assert.equal(value, "custom-loader-worked: This is some sample data");
              });
            });
          `,
          'dedup-test.js': `
            import { module, test } from 'qunit';

            module('Unit | deduplication', function(hooks) {

              let sourceCode;

              hooks.before(async function() {
                sourceCode = '';
                let chunkURLs = [...document.querySelectorAll('script')].map(s => s.src).filter(src => /chunk.*\.js$/.test(src));
                for (let chunkURL of chunkURLs) {
                  let response = await fetch(chunkURL);
                  sourceCode += await response.text();
                }
              });

              test('a module imported by both the app and an addon gets deduplicated', async function(assert) {
                assert.equal(sourceCode.match(/ember_auto_import_sample_lib/g).length, 1, "expected only one copy of inner-lib in chunks");
              });

              test('a module imported both directly by the app and indirectly by another imported module gets deduplicated', async function(assert) {
                assert.equal(sourceCode.match(/ember_auto_import_inner_lib2_named/g).length, 1, "expected only one copy of inner-lib2/named in chunks");
              });
            })
          `,
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
      test('ensure build succeeds', async function (assert) {
        let result = await app.execute('volta run npm -- run test');
        assert.equal(result.exitCode, 0, result.output);
      });
    });
  });
