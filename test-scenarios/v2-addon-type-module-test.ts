import merge from 'lodash/merge';
import { appScenarios, baseAddonInProject, baseV2Addon } from './scenarios';
import { PreparedApp, Project } from 'scenario-tester';
import QUnit from 'qunit';
const { module: Qmodule, test } = QUnit;

// v1 ember addons are not statically resolvable, so when a v2 addon imports
// one we externalize it to the runtime AMD loader. Default-importing an AMD
// module from a strict-ESM file is one of the things that breaks without our
// javascript/auto rule, so this addon exists to cover the "type=module v2
// addon depends on a v1 addon" case explicitly.
function buildInnerV1Addon(project: Project) {
  let addon = baseAddonInProject(project);
  addon.name = 'inner-v1-addon';
  merge(addon.files, {
    addon: {
      'index.js': `
        export default function innerV1Default() {
          return 'inner-v1-default-worked';
        }
        export function innerV1Named() {
          return 'inner-v1-named-worked';
        }
      `,
    },
  });
  return addon;
}

// A v2 addon that sets `"type": "module"` in its package.json. All of its
// .js files get webpack's strict ESM treatment unless we intervene, which
// breaks (1) default-imports of the CommonJS/AMD modules we externalize,
// like `@ember/component/template-only`, `@glimmer/component`, and any v1
// addon, and (2) imports that aren't fully-specified, like directory imports
// and the relative `es-compat2` import that `@embroider/macros` emits for
// `importSync()`.
function buildTypeModuleV2Addon(project: Project) {
  let addon = baseV2Addon();
  addon.pkg.name = 'esm-v2-addon';
  addon.pkg.type = 'module';
  addon.pkg.exports = {
    '.': './index.js',
    './*': './*.js',
    './addon-main.cjs': './addon-main.cjs',
  };

  merge(addon.files, {
    'index.js': `
      import { two } from './lib';
      export function useDirectoryImport() {
        return two();
      }
    `,
    lib: {
      'index.js': `
        export function two() {
          return 'esm-directory-import-worked';
        }
      `,
    },
    'side-effect.js': `
      window.__esm_v2_addon_side_effect = 'esm-side-effect-worked';
    `,
    'uses-import-sync.js': `
      import { importSync } from '@embroider/macros';
      importSync('./side-effect.js');
    `,
    'uses-v1-addon.js': `
      import innerV1Default, { innerV1Named } from 'inner-v1-addon';
      export function useV1AddonDefault() {
        return innerV1Default();
      }
      export function useV1AddonNamed() {
        return innerV1Named();
      }
    `,
    app: {
      components: {
        'esm-hello.js': `
          export { default } from 'esm-v2-addon/components/hello';
        `,
        'esm-counter.js': `
          export { default } from 'esm-v2-addon/components/counter';
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
            "<div data-test='esm-v2-addon-hello'>Hello from ESM</div>", {
              strictMode: true,
            }
          ),
          templateOnlyComponent()
        );
      `,
      'counter.js': `
        import Component from '@glimmer/component';
        import { setComponentTemplate } from "@ember/component";
        import { precompileTemplate } from "@ember/template-compilation";

        class Counter extends Component {
          get count() {
            return 42;
          }
        }

        export default setComponentTemplate(
          precompileTemplate(
            "<div data-test='esm-v2-addon-counter'>{{this.count}}</div>", {
              strictMode: true,
            }
          ),
          Counter
        );
      `,
    },
  });

  addon.linkDependency('@embroider/addon-shim', { baseDir: __dirname });
  addon.linkDependency('@embroider/macros', { baseDir: __dirname });
  addon.addDependency(buildInnerV1Addon(project));

  (addon.pkg['ember-addon'] as any)['app-js'] = {
    './components/esm-hello.js': './app/components/esm-hello.js',
    './components/esm-counter.js': './app/components/esm-counter.js',
  };
  return addon;
}

appScenarios
  .skip('lts')
  .skip('ember3')
  // rendering a component from a v2 addon like this is broken on ember-source
  // 7 alphas whether or not the addon says type=module, so these scenarios
  // don't tell us anything about type=module support. (v2-addon-test.ts also
  // skips them.)
  .skip('beta')
  .skip('canary')
  .map('v2-addon-type-module', project => {
    project.addDevDependency(buildTypeModuleV2Addon(project));

    merge(project.files, {
      app: {
        lib: {
          'exercise-esm.js': `
            import { useDirectoryImport } from 'esm-v2-addon';
            import 'esm-v2-addon/uses-import-sync';
            export { useDirectoryImport };
          `,
        },
        templates: {
          'application.hbs': '{{outlet}}',
          'index.hbs': '<EsmHello /><EsmCounter />',
        },
      },
      tests: {
        acceptance: {
          'esm-index-test.js': `
            import { module, test } from 'qunit';
            import { visit } from '@ember/test-helpers';
            import { setupApplicationTest } from 'ember-qunit';
            module('Acceptance | index', function (hooks) {
              setupApplicationTest(hooks);
              test('can render a template-only component from a type=module v2 addon', async function (assert) {
                await visit('/');
                assert.equal(document.querySelector('[data-test="esm-v2-addon-hello"]').textContent.trim(), 'Hello from ESM');
              });
              test('can render a glimmer component from a type=module v2 addon', async function (assert) {
                await visit('/');
                assert.equal(document.querySelector('[data-test="esm-v2-addon-counter"]').textContent.trim(), '42');
              });
            });
          `,
        },
        unit: {
          'esm-import-test.js': `
            import { module, test } from 'qunit';
            import { useDirectoryImport } from '@ef4/app-template/lib/exercise-esm';
            import { useV1AddonDefault, useV1AddonNamed } from 'esm-v2-addon/uses-v1-addon';

            module('Unit | import from type=module v2 addon', function () {
              test('the addon can use a directory import internally', function (assert) {
                assert.equal(useDirectoryImport(), 'esm-directory-import-worked');
              });
              test('the addon can use importSync from @embroider/macros', function (assert) {
                assert.equal(window.__esm_v2_addon_side_effect, 'esm-side-effect-worked');
              });
              test('the addon can default-import from a v1 addon dependency', function (assert) {
                assert.equal(useV1AddonDefault(), 'inner-v1-default-worked');
              });
              test('the addon can named-import from a v1 addon dependency', function (assert) {
                assert.equal(useV1AddonNamed(), 'inner-v1-named-worked');
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

      test('pnpm test', async function (assert) {
        let result = await app.execute('pnpm run test');
        assert.equal(result.exitCode, 0, result.output);
      });
    });
  });
