import { appScenarios } from './scenarios';
import { PreparedApp } from 'scenario-tester';
import QUnit from 'qunit';
import merge from 'lodash/merge';
const { module: Qmodule, test } = QUnit;

// this scenario tests that users can customize webpack's noParse and their
// customization takes effect *without* breaking our own internal use of
// noParse.
appScenarios
  .map('noparse', project => {
    project.linkDependency('ember-auto-import', { baseDir: __dirname });
    project.addDependency('noparsed-dependency', {
      files: {
        'index.js': `
          window.emberAutoImportNoparsedDependency = function() {

            window.define('this-is-not-a-real-dependency', function() {
              return 'ember-auto-import-noparsed-dependency';
            });

            // this deliberately blows up if we let webpack parse and rewrite this file.
            // It works if webpack ignores our file.
            return require('this-is-not-a-real-dependency');
          };
        `,
      },
    });
    merge(project.files, {
      'ember-cli-build.js': `
        'use strict';

        const EmberApp = require('ember-cli/lib/broccoli/ember-app');

        module.exports = function(defaults) {
          let app = new EmberApp(defaults, {
            autoImport: {
              webpack: {
                module: {
                  noParse: /\\bnoparsed-dependency\\b/
                }
              }
            }
          });

          return app.toTree();
        };
      `,
      app: {
        controllers: {
          'application.js': `
            import Controller from '@ember/controller';
            import { computed } from '@ember-decorators/object';

            // sets window.emberAutoImportNoparsedDependency
            import 'noparsed-dependency';

            export default class extends Controller {
              @computed()
              get result() {
                return window.emberAutoImportNoparsedDependency();
              }
            }
          `,
        },
        templates: {
          'application.hbs': `<div data-test-import-result>{{result}}</div>`,
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

              test('the noparsed-dep loads correctly', async function(assert) {
                await visit('/');
                assert.equal(document.querySelector('[data-test-import-result]').textContent.trim(), 'ember-auto-import-noparsed-dependency');
              });
            });
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
