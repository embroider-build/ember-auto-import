import { appScenarios } from './scenarios';
import { PreparedApp, Project } from 'scenario-tester';
import QUnit from 'qunit';
import merge from 'lodash/merge';
import { dirname } from 'path';
import { setupFastboot } from './fastboot-helper';
const { module: Qmodule, test } = QUnit;

function makeAddon() {
  let addon = Project.fromDir(dirname(require.resolve('@ef4/addon-template/package.json')), { linkDeps: true });
  addon.linkDependency('ember-auto-import', { baseDir: __dirname });
  addon.pkg.name = 'sample-addon';
  merge(addon.files, {
    'index.js': `
      'use strict';

      module.exports = {
        name: require('./package').name,
        options: {
          babel: {
            plugins: [ require.resolve('ember-auto-import/babel-plugin') ]
          }
        }
      };
    `,
    app: {
      components: {
        'from-sample-addon.js': `
        export { default } from 'sample-addon/components/from-sample-addon';
      `,
      },
    },
    addon: {
      'index.js': `
        export async function useExtra() {
          let { extra } = await import('some-lib/extra');
          return extra();
        }
      `,
      components: {
        'from-sample-addon.js': `
        import Component from '@ember/component';
        import { computed } from '@ember/object';
        import layout from '../templates/components/from-sample-addon';
        import { makeMessage } from 'some-lib';
        export default Component.extend({
          layout,
          message: computed(function() {
            return makeMessage();
          })
        });
      `,
      },
      templates: {
        components: {
          'from-sample-addon.hbs': `<div data-test="from-sample-addon">{{this.message}}</div>`,
        },
      },
    },
    'addon-test-support': {
      'index.js': `
      import { makeMessage } from 'some-lib2';

      export default function () {
        return makeMessage();
      }
    `,
    },
  });
  addon.addDependency('some-lib', {
    files: {
      'index.js': `
        export function makeMessage() {
          return "This is the message";
        }
      `,
      'extra.js': `
        export function extra() {
          return "This is from the extra module that we lazily load";
        }
      `,
    },
  });

  addon.addDependency('some-lib2', {
    files: {
      'index.js': `
    export function makeMessage() {
      return "This someLib2";
    }
  `,
    },
  });
  return addon;
}

appScenarios
  .map('indirect', project => {
    project.addDevDependency(makeAddon());
    project.linkDependency('ember-cli-fastboot', { baseDir: __dirname });

    merge(project.files, {
      app: {
        'router.js': `
          import EmberRouter from '@ember/routing/router';
          import config from './config/environment';

          const Router = EmberRouter.extend({
            location: config.locationType,
            rootURL: config.rootURL,
          });

          Router.map(function () {
            this.route('dep-check');
          });

          export default Router;
        `,
        templates: {
          'application.hbs': `{{outlet}}`,
          'index.hbs': `
            {{from-sample-addon}}
          `,
          'dep-check.hbs': `
            <div data-test="lib2-status">{{#if hasLib2}}yes{{else}}no{{/if}}</div>
          `,
        },
        controllers: {
          'dep-check.js': `
            import Controller from '@ember/controller';
            import { computed } from '@ember/object';

            export default Controller.extend({
              hasLib2: computed(function () {
                try {
                  window.require('some-lib2');
                  return true;
                } catch (err) {
                  return false;
                }
              }),
            });

          `,
        },
      },
      tests: {
        acceptance: {
          'basic-test.js': `
            import { module, test } from 'qunit';
            import { visit } from '@ember/test-helpers';
            import { setupApplicationTest } from 'ember-qunit';

            module('Acceptance | basic', function (hooks) {
              setupApplicationTest(hooks);

              test('an addon can use an auto-imported dependency when called from an app that does not', async function (assert) {
                await visit('/');
                assert.equal(document.querySelector('[data-test="from-sample-addon"]').textContent.trim(), 'This is the message');
              });

              test('addon-test-support deps are present inside the test suite', async function (assert) {
                await visit('/dep-check');
                assert.equal(
                  document.querySelector('[data-test="lib2-status"]').textContent.trim(),
                  'yes',
                  'expected inner-lib2 to be present'
                );
              });
            });
          `,
        },
        unit: {
          'addon-dynamic-import-test.js': `
            import { module, test } from 'qunit';
            import { useExtra } from 'sample-addon';

            module('Unit | addon-dynamic-import', function () {
              test('addon can load a dependency dynamically', async function(assert) {
                let result = await useExtra();
                assert.equal(result, "This is from the extra module that we lazily load");
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

      Qmodule('fastboot', function (hooks) {
        let visit: any;
        hooks.before(async function () {
          ({ visit } = await setupFastboot(app));
        });

        test('deps working', async function (assert) {
          let dom = await visit('/');
          assert.equal(
            dom.window.document.querySelector('[data-test="from-sample-addon"]').textContent.trim(),
            'This is the message'
          );
        });

        test('no test-support deps in app', async function (assert) {
          let dom = await visit('/dep-check');
          assert.equal(
            dom.window.document.querySelector('[data-test="lib2-status"]').textContent.trim(),
            'no',
            'expected some-lib2 to not be present'
          );
        });
      });
    });
  });
