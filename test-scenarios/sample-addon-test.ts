import merge from 'lodash/merge';
import { addonScenarios } from './scenarios';
import { PreparedApp } from 'scenario-tester';
import QUnit from 'qunit';
const { module: Qmodule, test } = QUnit;
const backtick = '`';

addonScenarios
  .map('sample-addon', project => {
    merge(project.files, {
      addon: {
        components: {
          'from-sample-addon.js': `
            import Component from '@ember/component';
            import layout from '../templates/components/from-sample-addon';
            import { capitalize } from 'lodash-es';
            import { computed } from '@ember/object';

            export default Component.extend({
              layout,
              message: computed(function () {
                return capitalize('hello');
              }),
            });
          `,
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
            'from-sample-addon.hbs': `
              <div data-test="from-sample-addon">{{message}}</div>
            `,
            'sample-addon-inner-lib.hbs': `
              <div data-test="sample-addon-inner-lib">{{message}}</div>
            `,
          },
        },
      },
      'addon-test-support': {
        'index.js': `
          import innerLib2 from 'inner-lib2';
          export default function () {
            return innerLib2();
          }
        `,
      },
      app: {
        components: {
          'from-sample-addon.js': `
            export { default } from '@ef4/addon-template/components/from-sample-addon';
          `,
          'sample-addon-inner-lib.js': `
            export { default } from '@ef4/addon-template/components/sample-addon-inner-lib';
          `,
        },
      },
      tests: {
        acceptance: {
          'index-test.js': `
            import { module, test } from 'qunit';
            import { visit } from '@ember/test-helpers';
            import { setupApplicationTest } from 'ember-qunit';

            module('Acceptance | index', function (hooks) {
              setupApplicationTest(hooks);

              test('can auto import devDependencies from within dummy app', async function (assert) {
                await visit('/');
                assert.equal(document.querySelector('[data-test="dummy-app-message"]').textContent.trim(), '2018');
              });
            });
          `,
        },
        dummy: {
          app: {
            controllers: {
              'index.js': `
                import Controller from '@ember/controller';
                import moment from 'moment';

                export default Controller.extend({
                  message: moment('2018-06-10').format('YYYY'),
                });
              `,
            },
            templates: {
              'index.hbs': `
                <div data-test="dummy-app-message">{{message}}</div>
              `,
            },
          },
        },
        integration: {
          components: {
            'from-sample-addon.js': `
              import { module, test } from 'qunit';
              import { setupRenderingTest } from 'ember-qunit';
              import { render } from '@ember/test-helpers';
              import hbs from 'htmlbars-inline-precompile';

              module('Integration | Component | from-sample-addon', function (hooks) {
                setupRenderingTest(hooks);

                test('it renders', async function (assert) {
                  await render(hbs${backtick}{{from-sample-addon}}${backtick});
                  assert.equal(this.element.textContent.trim(), 'Hello');
                });
              });
            `,
            'sample-addon-inner-test.js': `
              import { module, test } from 'qunit';
              import { setupRenderingTest } from 'ember-qunit';
              import { render } from '@ember/test-helpers';
              import hbs from 'htmlbars-inline-precompile';

              module('Integration | Component | sample-addon-inner-lib', function (hooks) {
                setupRenderingTest(hooks);

                test('it locates inner-lib', async function (assert) {
                  await render(hbs${backtick}{{sample-addon-inner-lib}}${backtick});
                  assert.equal(this.element.textContent.trim(), 'ember_auto_import_sample_lib');
                });
              });
            `,
          },
        },
        unit: {
          'inner-module-test.js': `
            import { module, test } from 'qunit';
            import named from 'inner-lib2/named';
            import deeperIndex from 'inner-lib2/deeper';
            import deeperNamed from 'inner-lib2/deeper/named';

            module('Unit | inner modules', function () {
              test('module imported by filename from top-level of its package', function (assert) {
                assert.equal(named(), 'ember_auto_import_inner_lib2_named');
              });
              test('module imported from index.js inside a subdir of its package', function (assert) {
                assert.equal(deeperIndex(), 'deeper index');
              });
              test('module imported by filename inside a subdir of its package', function (assert) {
                assert.equal(deeperNamed(), 'deeper named');
              });
            });
          `,
          'test-support-test.js': `
            import thing from '@ef4/addon-template/test-support';
            import { module, test } from 'qunit';

            module('Unit | imports in test-support', function () {
              test('it works', function (assert) {
                assert.equal(thing(), 'innerlib2 loaded');
              });
            });
          `,
        },
      },
    });

    project.addDependency('inner-lib', {
      files: {
        'index.js': `
          module.exports = function() {
            return 'ember_auto_import_sample_lib';
          }
        `,
      },
    });

    project.addDependency('inner-lib2', {
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

    project.linkDevDependency('moment', { baseDir: __dirname });
    project.linkDependency('ember-auto-import', { baseDir: __dirname });
    project.linkDependency('lodash-es', { baseDir: __dirname });
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
