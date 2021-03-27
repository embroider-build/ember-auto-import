import { appScenarios } from './scenarios';
import { PreparedApp } from 'scenario-tester';
import QUnit from 'qunit';
import merge from 'lodash/merge';
const { module: Qmodule, test } = QUnit;

appScenarios
  .map('common-chunk', project => {
    project.linkDevDependency('ember-auto-import', { baseDir: __dirname });

    project.addDevDependency('some-lib', {
      files: {
        'left.js': `
          import { helper } from './common';
          export function left() {
            return helper('left');
          }
        `,
        'right.js': `
          import { helper } from './common';
          export function right() {
            return helper('right');
          }
        `,
        'common.js': `
          export function helper(msg) {
            return "the message is " + msg;
          }
        `,
      },
    });

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
              webpack: {
                optimization: {
                  splitChunks: {
                    // for test purposes, we want chunk
                    // splitting even though our common chunk is very small
                    minSize: 0
                  }
                }
              }
            }
          });
          return app.toTree();
        };
      `,
      app: {
        lib: {
          'example.js': `
            export async function useLeft() {
              let { left } = await import('some-lib/left');
              return left();
            }
            export async function useRight() {
              let { right } = await import('some-lib/right');
              return right();
            }
          `,
        },
      },
      tests: {
        unit: {
          'example-test.js': `
            import { module, test } from 'qunit';
            import { useLeft, useRight } from '@ef4/app-template/lib/example';

            module('Unit | common chunk', function () {
              test('can use two dynamic imports that share a common chunk', async function(assert) {
                assert.equal(await useLeft(), 'the message is left');
                assert.equal(await useRight(), 'the message is right');
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

      test('npm run test', async function (assert) {
        let result = await app.execute('npm run test');
        assert.equal(result.exitCode, 0, result.output);
      });
    });
  });
