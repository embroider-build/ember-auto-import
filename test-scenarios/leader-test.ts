import { baseAddon, baseApp } from './scenarios';
import { PreparedApp, Scenarios } from 'scenario-tester';
import QUnit from 'qunit';
import merge from 'lodash/merge';
const { module: Qmodule, test } = QUnit;

Scenarios.fromProject(baseApp)
  .map('leader-success', project => {
    project.linkDependency('ember-auto-import', { baseDir: __dirname });
    project.linkDependency('webpack', { baseDir: __dirname });

    project.addDependency('images', {
      files: {
        'thing.png': 'fake image here',
      },
    });
    merge(project.files, {
      // this is deliberately using a webpack5 feature, so it will break if the
      // wrong copy of ember auto import is leading
      'ember-cli-build.js': `
        const EmberApp = require('ember-cli/lib/broccoli/ember-app');
        module.exports = function (defaults) {
          let app = new EmberApp(defaults, {
            autoImport: {
              webpack: {
                module: {
                  rules: [
                    {
                      test: /\.png/,
                      type: 'asset/source'
                    }
                  ]
                },
              }
            }
          });
          return app.toTree();
        };
      `,
      tests: {
        unit: {
          'asset-test.js': `
            import { module, test } from 'qunit';
            import example from 'images/thing.png';

            module('Unit | webpack5', function () {
              test('can use webpack5 asset loading', function (assert) {
                assert.equal(example, 'fake image here');
              });
            });
          `,
        },
      },
    });

    let a = baseAddon();
    a.name = 'a';
    // this is a version of ember-auto-import that uses the v2 leader election protocol
    a.linkDependency('ember-auto-import', { baseDir: __dirname, resolveName: 'leader-v2' });
    project.addDependency(a);

    let b = baseAddon();
    b.name = 'b';
    // this is a version of ember-auto-import that uses the v1 leader election protocol
    b.linkDependency('ember-auto-import', { baseDir: __dirname, resolveName: 'leader-v1' });
    project.addDependency(b);
  })
  .forEachScenario(scenario => {
    Qmodule(scenario.name, function (hooks) {
      let app: PreparedApp;
      hooks.before(async () => {
        app = await scenario.prepare();
      });
      test('run tests', async function (assert) {
        let result = await app.execute('pnpm  run test');
        assert.equal(result.exitCode, 0, result.output);
      });
    });
  });

Scenarios.fromProject(baseApp)
  .map('leader-too-old', project => {
    project.linkDependency('ember-auto-import', { baseDir: __dirname, resolveName: 'leader-v2' });

    let a = baseAddon();
    a.name = 'problematic-addon';
    a.linkDependency('ember-auto-import', { baseDir: __dirname });
    project.addDependency(a);
    let b = baseAddon();
    b.name = 'other-problematic-addon';
    b.linkDependency('ember-auto-import', { baseDir: __dirname });
    project.addDependency(b);
  })
  .forEachScenario(scenario => {
    Qmodule(scenario.name, function (hooks) {
      let app: PreparedApp;
      hooks.before(async () => {
        app = await scenario.prepare();
      });
      test('ensure error', async function (assert) {
        let result = await app.execute('pnpm  run build');
        assert.notEqual(result.exitCode, 0, result.output);
        assert.ok(
          /To use these addons, your app needs ember-auto-import >= 2: .*other-problematic-addon.*problematic-addon/.test(
            result.stderr
          ),
          result.stderr
        );
      });
    });
  });

Scenarios.fromProject(baseApp)
  .map('leader-missing', project => {
    let a = baseAddon();
    a.name = 'problematic-addon';
    a.linkDependency('ember-auto-import', { baseDir: __dirname });
    project.addDependency(a);
    let b = baseAddon();
    b.name = 'other-problematic-addon';
    b.linkDependency('ember-auto-import', { baseDir: __dirname });
    project.addDependency(b);
  })
  .forEachScenario(scenario => {
    Qmodule(scenario.name, function (hooks) {
      let app: PreparedApp;
      hooks.before(async () => {
        app = await scenario.prepare();
      });
      test('ensure error', async function (assert) {
        let result = await app.execute('pnpm  run build');
        assert.notEqual(result.exitCode, 0, result.output);
        assert.ok(
          /To use these addons, your app needs ember-auto-import >= 2: .*other-problematic-addon.*problematic-addon/.test(
            result.stderr
          ),
          result.stderr
        );
      });
    });
  });
