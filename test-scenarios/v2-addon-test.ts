import merge from 'lodash/merge';
import { appScenarios } from './scenarios';
import { PreparedApp, Project } from 'scenario-tester';
import { setupFastboot } from './fastboot-helper';
import { dirname } from 'path';
import QUnit from 'qunit';
const { module: Qmodule, test } = QUnit;

function buildV2Addon() {
  let addon = new Project('my-v2-addon', {
    files: {
      'addon-main.js': `
        const { addonV1Shim } = require('@embroider/addon-shim');
        module.exports = addonV1Shim(__dirname);
      `,
      'index.js': `
        import plainDep from 'plain-dep';
        import { innerV1Addon } from 'inner-v1-addon';
        import { innerV2Addon } from 'inner-v2-addon';
        export function usePlainDep() {
          return plainDep();
        }
        export function useInnerV1Addon() {
          return innerV1Addon();
        }
        export function useInnerV2Addon() {
          return innerV2Addon();
        }
        export function helloUtil() {
          return 'hello-util-worked';
        }
      `,
      'test-support.js': `
        export function helloTestSupport() {
          return 'hello-test-support-worked';
        }
      `,
      app: {
        components: {
          'hello-world.js': `
            export { default } from 'my-v2-addon/components/hello';
          `,
        },
      },
      components: {
        'hello.js': `
          import { setComponentTemplate } from "@ember/component";
          import { precompileTemplate } from "@ember/template-compilation";
          import templateOnlyComponent from "@ember/component/template-only";
          export default setComponentTemplate(
            precompileTemplate(
              "<div data-test='my-v2-addon-hello'>Hello World</div>", {
                strictMode: true,
              }
            ),
            templateOnlyComponent()
          );
        `,
      },
    },
  });
  addon.linkDependency('@embroider/addon-shim', { baseDir: __dirname });

  addon.addDependency('plain-dep', {
    files: {
      'index.js': `export default function() { return 'plain-dep-worked'; }`,
    },
  });

  addon.addDependency(buildInnerV1Addon());
  addon.addDependency(buildInnerV2Addon('inner-v2-addon'));

  addon.pkg.keywords = addon.pkg.keywords ? [...addon.pkg.keywords, 'ember-addon'] : ['ember-addon'];
  addon.pkg['ember-addon'] = {
    version: 2,
    type: 'addon',
    main: './addon-main.js',
    'app-js': {
      './components/hello-world.js': './app/components/hello-world.js',
    },
  };
  return addon;
}

function buildInnerV1Addon() {
  let addon = Project.fromDir(dirname(require.resolve('@ef4/addon-template/package.json')), { linkDeps: true });
  addon.name = 'inner-v1-addon';
  merge(addon.files, {
    addon: {
      'index.js': `
        export function innerV1Addon() {
          return 'inner-v1-addon-worked';
        }
      `,
    },
  });
  return addon;
}

function buildIntermediateV1Addon() {
  let addon = Project.fromDir(dirname(require.resolve('@ef4/addon-template/package.json')), { linkDeps: true });
  addon.name = 'intermediate-v1-addon';
  merge(addon.files, {
    app: {
      'from-intermediate-v1-addon.js': `
        import { innerV2Addon } from 'second-v2-addon';
        export default function() {
          return 'intermediate-v1-addon-appTree-' + innerV2Addon();
        }
      `,
    },
    addon: {
      'index.js': `
        import { innerV2Addon } from 'third-v2-addon';
        import { secondary } from 'third-v2-addon/secondary';
        export default function() {
          return 'intermediate-v1-addon-addonTree-' + innerV2Addon() + '-' + secondary();
        }
      `,
    },
  });
  addon.addDependency(buildInnerV2Addon('second-v2-addon'));
  addon.addDependency(buildV2AddonWithExports('third-v2-addon'));
  return addon;
}

function buildV2AddonWithExports(name: string) {
  let addon = new Project(name, {
    files: {
      'addon-main.js': `
        const { addonV1Shim } = require('@embroider/addon-shim');
        module.exports = addonV1Shim(__dirname);
      `,
      special: {
        'index.js': `
          export function innerV2Addon() {
            return '${name}-worked';
          }
        `,
        'secondary.js': `
          export function secondary() {
            return '${name}-secondary-worked';
          }
        `,
      },
    },
  });
  addon.linkDependency('@embroider/addon-shim', { baseDir: __dirname });
  addon.pkg.keywords = addon.pkg.keywords ? [...addon.pkg.keywords, 'ember-addon'] : ['ember-addon'];
  addon.pkg['ember-addon'] = {
    version: 2,
    type: 'addon',
    main: './addon-main.js',
  };
  addon.pkg.exports = {
    '.': './special/index.js',
    './*': './special/*.js',
  };
  return addon;
}

function buildInnerV2Addon(name: string) {
  let addon = new Project(name, {
    files: {
      'addon-main.js': `
        const { addonV1Shim } = require('@embroider/addon-shim');
        module.exports = addonV1Shim(__dirname);
      `,
      'index.js': `
        export function innerV2Addon() {
          return '${name}-worked';
        }
      `,
    },
  });
  addon.linkDependency('@embroider/addon-shim', { baseDir: __dirname });
  addon.pkg.keywords = addon.pkg.keywords ? [...addon.pkg.keywords, 'ember-addon'] : ['ember-addon'];
  addon.pkg['ember-addon'] = {
    version: 2,
    type: 'addon',
    main: './addon-main.js',
  };
  return addon;
}

let scenarios = appScenarios.skip('lts').map('v2-addon', project => {
  project.addDevDependency(buildV2Addon());
  project.addDevDependency(buildIntermediateV1Addon());
  project.addDevDependency(buildV2AddonWithExports('fourth-v2-addon'));

  merge(project.files, {
    app: {
      lib: {
        'exercise.js': `
            import { helloUtil, usePlainDep, useInnerV1Addon, useInnerV2Addon } from 'my-v2-addon';
            import { innerV2Addon as fourthMain } from 'fourth-v2-addon';
            import { secondary as fourthSecondary } from 'fourth-v2-addon/secondary';
            export function useHelloUtil() {
              return helloUtil();
            }
            export { usePlainDep, useInnerV1Addon, useInnerV2Addon, fourthMain, fourthSecondary };
          `,
      },
      helpers: {
        'have-runtime-module.js': `
          import { helper } from '@ember/component/helper';
          export default helper(function haveRuntimeModule([name]) {
            try {
              return Boolean(window.require(name));
            } catch (err) {
              return false;
            }
          });
        `,
      },
      templates: {
        'application.hbs': '{{outlet}}',
        'index.hbs': '<HelloWorld />',
        'check-contents.hbs': `
          <div data-test="my-v2-addon">{{have-runtime-module "my-v2-addon"}}</div>
          <div data-test="my-v2-addon/test-support">{{have-runtime-module "my-v2-addon/test-support"}}</div>
        `,
      },
      'router.js': `
        import EmberRouter from '@ember/routing/router';
        import config from './config/environment';
        const Router = EmberRouter.extend({
          location: config.locationType,
          rootURL: config.rootURL,
        });
        Router.map(function () {
          this.route('check-contents');
        });
        export default Router;
      `,
    },
    tests: {
      acceptance: {
        'index-test.js': `
            import { module, test } from 'qunit';
            import { visit } from '@ember/test-helpers';
            import { setupApplicationTest } from 'ember-qunit';
            module('Acceptance | index', function (hooks) {
              setupApplicationTest(hooks);
              test('can render component from v2 addon', async function (assert) {
                await visit('/');
                assert.equal(document.querySelector('[data-test="my-v2-addon-hello"]').textContent.trim(), 'Hello World');
              });
            });
          `,
      },
      unit: {
        'inner-module-test.js': `
            import { module, test } from 'qunit';
            import {
              useHelloUtil,
              usePlainDep,
              useInnerV1Addon,
              useInnerV2Addon,
              fourthMain,
              fourthSecondary
            } from '@ef4/app-template/lib/exercise';
            import { helloTestSupport } from 'my-v2-addon/test-support';

            module('Unit | import from v2-addon', function () {
              test('can import from v2 addon top-level export', function (assert) {
                assert.equal(useHelloUtil(), 'hello-util-worked');
              });
              test('v2 addon was able to import from a plain npm package', function (assert) {
                assert.equal(usePlainDep(), 'plain-dep-worked');
              });
              test('plain npm package consumed by v2 package does not show up in amd loader', function(assert) {
                assert.throws(() => window.require('plain-dep'));
              });
              test('v2 addon was able to import from a v1 addon', function (assert) {
                assert.equal(useInnerV1Addon(), 'inner-v1-addon-worked');
              });
              test('inner v1 addon shows up in amd loader', function (assert) {
                assert.equal(window.require('inner-v1-addon').innerV1Addon(), 'inner-v1-addon-worked');
              });
              test('v2 addon was able to import from a v2 addon', function (assert) {
                assert.equal(useInnerV2Addon(), 'inner-v2-addon-worked');
              });
              test('second-level v2 addon does not show up in amd loader', function(assert) {
                assert.throws(() => window.require('inner-v2-addon'));
              });
              test('tests can import directly from another exported module', function (assert) {
                assert.equal(helloTestSupport(), 'hello-test-support-worked');
              });
              test('app can import main entrypoint from a v2 addon with customized exports', function (assert) {
                assert.equal(fourthMain(), 'fourth-v2-addon-worked');
              });
              test('app can import secondary entrypoint from a v2 addon with customized exports', function (assert) {
                assert.equal(fourthSecondary(), 'fourth-v2-addon-secondary-worked');
              });
            });
          `,
        'intermediate-addon-test.js': `
            import intermediateV1AppTree from '@ef4/app-template/from-intermediate-v1-addon';
            import intermediateV1AddonTree from 'intermediate-v1-addon';
            import { module, test } from 'qunit';
            module('Unit | v2-addon from intermediate v1 addon', function () {
              test('the app tree in a v1 addon can access a v2 addon', function(assert) {
                assert.equal(intermediateV1AppTree(), 'intermediate-v1-addon-appTree-second-v2-addon-worked');
              });
              test('the addon tree in a v1 addon can access a v2 addon', function(assert) {
                assert.equal(intermediateV1AddonTree(), 'intermediate-v1-addon-addonTree-third-v2-addon-worked-third-v2-addon-secondary-worked');
              });
            });
          `,
      },
    },
  });

  project.linkDependency('ember-auto-import', { baseDir: __dirname });
  project.linkDependency('ember-cli-fastboot', { baseDir: __dirname });
});

scenarios.forEachScenario(scenario => {
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

scenarios
  .only('release-v2-addon')
  .expand({
    'fastboot-dev': () => {},
    'fastboot-prod': () => {},
  })
  .forEachScenario(scenario => {
    Qmodule(scenario.name, function (hooks) {
      let visit: any;

      hooks.before(async () => {
        ({ visit } = await setupFastboot(
          await scenario.prepare(),
          scenario.name.endsWith('prod') ? 'production' : 'development'
        ));
      });

      test('component renders', async function (assert) {
        let dom = await visit('/');
        let document = dom.window.document;
        assert.equal(document.querySelector('[data-test="my-v2-addon-hello"]').textContent.trim(), 'Hello World');
      });

      test('app deps in app', async function (assert) {
        let dom = await visit('/check-contents');
        let document = dom.window.document;
        assert.equal(
          document.querySelector('[data-test="my-v2-addon"]').textContent.trim(),
          'true',
          'expected index to be present'
        );
      });

      test('no test deps in app', async function (assert) {
        let dom = await visit('/check-contents');
        let document = dom.window.document;
        assert.equal(
          document.querySelector('[data-test="my-v2-addon/test-support"]').textContent.trim(),
          'false',
          'expected test-support not to be present'
        );
      });
    });
  });
