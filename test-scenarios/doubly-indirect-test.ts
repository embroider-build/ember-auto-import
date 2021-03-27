import { appScenarios } from './scenarios';
import { PreparedApp, Project } from 'scenario-tester';
import QUnit from 'qunit';
import merge from 'lodash/merge';
import { dirname } from 'path';
const { module: Qmodule, test } = QUnit;

function makeAddon() {
  let addon = Project.fromDir(dirname(require.resolve('@ef4/addon-template/package.json')), { linkDeps: true });
  addon.linkDependency('ember-auto-import', { baseDir: __dirname });
  addon.pkg.name = 'sample-addon';
  merge(addon.files, {
    app: {
      components: {
        'from-sample-addon.js': `
        export { default } from 'sample-addon/components/from-sample-addon';
      `,
      },
    },
    addon: {
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

function makeIntermediateAddon() {
  let addon = Project.fromDir(dirname(require.resolve('@ef4/addon-template/package.json')), { linkDeps: true });
  addon.pkg.name = 'intermediate-addon';
  merge(addon.files, {
    app: {
      components: {
        'from-intermediate-addon.js': `
        export { default } from 'intermediate-addon/components/from-intermediate-addon';
      `,
      },
    },
    addon: {
      components: {
        'from-intermediate-addon.js': `
        import Component from '@ember/component';
        import layout from '../templates/components/from-intermediate-addon';
        export default Component.extend({
          layout,
        });
      `,
      },
      templates: {
        components: {
          'from-intermediate-addon.hbs': `<div data-test="from-intermediate-addon">{{from-sample-addon}}</div>`,
        },
      },
    },
  });

  addon.addDependency(makeAddon());

  return addon;
}

appScenarios
  .map('doubly-indirect', project => {
    project.addDevDependency(makeIntermediateAddon());

    merge(project.files, {
      app: {
        templates: {
          'application.hbs': `{{outlet}}`,
          'index.hbs': `
            {{from-intermediate-addon}}
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
              test('an addon two-levels deep can use auto-import', async function (assert) {
                await visit('/');
                assert.equal(document.querySelector('[data-test="from-intermediate-addon"] [data-test="from-sample-addon"]').textContent.trim(), 'This is the message');
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
