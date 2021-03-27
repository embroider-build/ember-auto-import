import { appScenarios } from './scenarios';
import { PreparedApp, Project } from 'scenario-tester';
import QUnit from 'qunit';
import merge from 'lodash/merge';
import path from 'path';
const { module: Qmodule, test } = QUnit;

appScenarios
  .map('merged', project => {
    let innerLib = project.addDevDependency('inner-lib', {
      files: {
        'index.js': `
          module.exports = function() {
            return 'ember_auto_import_sample_lib';
          }
        `,
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

    let addon = Project.fromDir(path.dirname(require.resolve('@ef4/addon-template/package.json')), { linkDeps: true });
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
              <div data-test="sample-addon-inner-lib">{{message}}</div>
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

    merge(project.files, {
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
            <div data-test="own-inner-lib">{{ownInnerLib}}</div>
            <div data-test="own-inner-lib2">{{ownInnerLib2}}</div>
            <div data-test="own-inner-lib2-named">{{ownInnerLib2Named}}</div>
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
          'dedup-test.js': `
            import { module, test } from 'qunit';

            module('Unit | deduplication', function(hooks) {

              let sourceCode;

              hooks.before(async function() {
                let vendorURL = [...document.querySelectorAll('script')].find(s => /vendor.*\.js$/.test(s.src)).src;
                let response = await fetch(vendorURL);
                sourceCode = await response.text();
              });

              test('a module imported by both the app and an addon gets deduplicated', async function(assert) {
                assert.equal(sourceCode.match(/ember_auto_import_sample_lib/g).length, 1, "expected only one copy of inner-lib in vendor.js");
              });

              test('a module imported both directly by the app and indirectly by another imported module gets deduplicated', async function(assert) {
                assert.equal(sourceCode.match(/ember_auto_import_inner_lib2_named/g).length, 1, "expected only one copy of inner-lib2/named in vendor.js");
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
        let result = await app.execute('npm run test');
        assert.equal(result.exitCode, 0, result.output);
      });
    });
  });
