import { appScenarios } from './scenarios';
import { PreparedApp } from 'scenario-tester';
import QUnit from 'qunit';
import merge from 'lodash/merge';
const { module: Qmodule, test } = QUnit;

appScenarios
  .map('babel6', project => {
    project.linkDependency('ember-auto-import', { baseDir: __dirname });
    project.linkDependency('ember-cli-babel', { baseDir: __dirname, resolveName: 'ember-cli-babel6' });

    merge(project.files, {
      app: {
        controllers: {
          'application.js': `
            import Controller from '@ember/controller';
            import { computed } from '@ember/object';
            import aModuleDependency from 'a-module-dependency';

            export default Controller.extend({
              moduleResult: computed(function() {
                return aModuleDependency();
              })
            })
          `,
        },
        templates: {
          'application.hbs': `
            <div data-test-module-result>{{moduleResult}}</div>
          `,
        },
      },
      config: {
        'targets.js': `
          'use strict';

          const browsers = [
            'last 1 Chrome versions',
            'last 1 Firefox versions',
            'last 1 Safari versions',
            'ie 11'
          ];

          module.exports = {
            browsers
          };

        `,
      },
      tests: {
        acceptance: {
          'basic-test.js': `
            import { module, test } from 'qunit';
            import { visit } from '@ember/test-helpers';
            import { setupApplicationTest } from 'ember-qunit';

            module('Acceptance | basic', function(hooks) {
              setupApplicationTest(hooks);

              test('visiting /basic', async function(assert) {
                await visit('/');
                assert.equal(document.querySelector('[data-test-module-result]').textContent.trim(), 'module transpiled');
              });
            });
          `,
        },
      },
    });

    project.addDevDependency('a-module-dependency', {
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
                return 'module transpiled';
              }
            } catch (e) {
              return 'module not transpiled';
            }
          }
        `,
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
    });
  });
