import merge from 'lodash/merge';
import { appScenarios, baseAddon, baseApp, baseV2Addon } from './scenarios';
import { PreparedApp, Project, Scenarios } from 'scenario-tester';
import { setupFastboot } from './fastboot-helper';
import QUnit from 'qunit';
const { module: Qmodule, test } = QUnit;

function buildV2Addon() {
  let addon = new Project('my-v2-addon', {
    files: {
      'addon-main.js': `
        const { addonV1Shim } = require('@embroider/addon-shim');
        module.exports = addonV1Shim(__dirname, {
          autoImportCompat: {
            customizeMeta(meta) {
              return {
                 ...meta,
                 'renamed-modules': {
                    ...(meta['renamed-modules'] ?? {}),
                    'customization-target/index.js': 'my-v2-addon/the-customized-target.js'
                 }
              }
            }
          }
        });
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
      'implicitly-included.js': `
        export default function() { return "my-v2-addon implicit module" }
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
      'special-module-dest.js': `
        export default function() {
          return "from a renamed module";
        }
      `,
      'the-customized-target.js': `
        export default function() {
          return "from customized target";
        }
      `,
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
    'renamed-modules': {
      'special-module/index.js': 'my-v2-addon/special-module-dest.js',
      'customization-target/index.js': 'my-v2-addon/this-does-not-exist.js',
    },
    'implicit-modules': ['./implicitly-included.js'],
  };
  return addon;
}

function buildInnerV1Addon() {
  let addon = baseAddon();
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
  let addon = baseAddon();
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
  addon.linkDependency('ember-auto-import', { baseDir: __dirname });

  return addon;
}

function buildV2AddonWithExports(name: string) {
  let addon = new Project(name, {
    files: {
      'addon-main.js': `
        const { addonV1Shim } = require('@embroider/addon-shim');
        module.exports = addonV1Shim(__dirname, {
          autoImportCompat: {
            customizeMeta(meta) {
              return {
                ...meta,
                'implicit-modules': ['./special/implicit.js'],
                'renamed-modules': {
                  "renamed-${name}/implicit": "${name}/implicit"
                }
              };
            }
          }
        });
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
        'implicit.js': `
          export default function() { return "${name} implicit module" }
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

function buildV2AddonWithMacros() {
  let addon = new Project('macro-using-addon', {
    files: {
      'addon-main.js': `
        const { addonV1Shim } = require('@embroider/addon-shim');
        module.exports = addonV1Shim(__dirname);
      `,
      dist: {
        'index.js': `
          import { getOwnConfig } from '@embroider/macros';
          export function macroExample() {
            return getOwnConfig().message;
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
    '.': './dist/index.js',
  };
  return addon;
}

function buildV2AddonWithDevDep() {
  let addon = new Project('with-dev-dep', {
    files: {
      'addon-main.js': `
        const { addonV1Shim } = require('@embroider/addon-shim');
        module.exports = addonV1Shim(__dirname);
      `,
      'index.js': `
        import Object from '@ember/object';
        export default function() {
          return Object.create();
        }
      `,
    },
  });
  addon.addDevDependency({ name: '@ember/object' }, project => {
    project.mergeFiles({
      'index.js': `
        export default class {
          static create() {
            throw new Error("This was not supposed to be used");
          }
        }
      `,
    });
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

// This addon tests that v2 addons can import from themselves using their package name.
// This is important for addons that use absolute imports internally, and ensures
// that naming conflicts with app modules don't break addon self-imports.
// See: https://github.com/embroider-build/ember-auto-import/issues/681
function buildV2AddonWithSelfImport() {
  let addon = new Project('addon-self-import', {
    files: {
      'addon-main.js': `
        const { addonV1Shim } = require('@embroider/addon-shim');
        module.exports = addonV1Shim(__dirname);
      `,
      dist: {
        'index.js': `
          // This import uses the package name to import from itself.
          // This should work even if the app has a conflicting module.
          import { addonHelper } from 'addon-self-import/utils/helper';
          export function addonMain() {
            return 'addon-main:' + addonHelper();
          }
        `,
        utils: {
          'helper.js': `
            export function addonHelper() {
              return 'addon-helper-value';
            }
          `,
        },
        components: {
          'my-component.js': `
            // Another self-import using package name
            import { addonHelper } from 'addon-self-import/utils/helper';
            export function myComponent() {
              return 'my-component:' + addonHelper();
            }
          `,
        },
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
    '.': './dist/index.js',
    './*': './dist/*',
  };
  return addon;
}

// This addon tests the fullySpecified: false fix for ESM modules.
// It has a directory structure where the component is at:
//   dist/components/my-component/index.js
// And uses "type": "module" in package.json with exports pattern "./*": "./dist/*".
// Without the fullySpecified: false fix, importing "addon-with-index/components/my-component"
// would fail because webpack 5's ESM resolution requires fully specified paths
// (including the file extension or explicit /index.js).
function buildV2AddonWithIndexResolution() {
  let addon = new Project('addon-with-index', {
    files: {
      'addon-main.cjs': `
        const { addonV1Shim } = require('@embroider/addon-shim');
        module.exports = addonV1Shim(__dirname);
      `,
      dist: {
        'index.js': `
          // This import tests ESM-to-ESM resolution within a type:module package.
          // It imports from a directory without specifying /index.js.
          // Without fullySpecified: false, this would fail.
          import { myComponent } from './components/my-component';
          export function mainExport() {
            return 'addon-with-index-main:' + myComponent();
          }
        `,
        components: {
          'my-component': {
            'index.js': `
              export function myComponent() {
                return 'my-component-from-index';
              }
            `,
          },
          'another-component': {
            'index.js': `
              export function anotherComponent() {
                return 'another-component-from-index';
              }
            `,
            'helper.js': `
              export function helper() {
                return 'helper-from-another-component';
              }
            `,
          },
        },
      },
    },
  });
  addon.linkDependency('@embroider/addon-shim', { baseDir: __dirname });
  addon.pkg.keywords = addon.pkg.keywords ? [...addon.pkg.keywords, 'ember-addon'] : ['ember-addon'];
  addon.pkg.type = 'module';
  addon.pkg['ember-addon'] = {
    version: 2,
    type: 'addon',
    main: './addon-main.cjs',
  };
  // This exports pattern tests that webpack can resolve directory imports
  // to index.js files when the package has "type": "module".
  // Without fullySpecified: false, webpack requires explicit /index.js paths.
  addon.pkg.exports = {
    '.': './dist/index.js',
    './*': './dist/*',
  };
  return addon;
}

// This addon tests the conditional exports pattern commonly used by v2 addons
// where exports map to .js files directly: "./*": { "default": "./dist/*.js" }
// This pattern is problematic when the actual files are directories with index.js
// because the exports field adds .js, bypassing directory resolution entirely.
// For example: import 'addon/components/name' -> exports maps to dist/components/name.js
// But if the actual file is dist/components/name/index.js, this fails.
function buildV2AddonWithConditionalExports() {
  let addon = new Project('addon-conditional-exports', {
    files: {
      'addon-main.cjs': `
        const { addonV1Shim } = require('@embroider/addon-shim');
        module.exports = addonV1Shim(__dirname);
      `,
      declarations: {
        'index.d.ts': `export declare function mainExport(): string;`,
        'components': {
          'flat-component.d.ts': `export declare function flatComponent(): string;`,
          'dir-component': {
            'index.d.ts': `export declare function dirComponent(): string;`,
          },
        },
      },
      dist: {
        'index.js': `
          export function mainExport() {
            return 'conditional-exports-main';
          }
        `,
        components: {
          // Flat file - works with "./*": "./dist/*.js" pattern
          'flat-component.js': `
            export function flatComponent() {
              return 'flat-component-value';
            }
          `,
          // Directory with index.js - does NOT work with "./*": "./dist/*.js" pattern
          // because exports maps 'components/dir-component' to 'dist/components/dir-component.js'
          // but the actual file is 'dist/components/dir-component/index.js'
          'dir-component': {
            'index.js': `
              export function dirComponent() {
                return 'dir-component-from-index';
              }
            `,
          },
        },
      },
    },
  });
  addon.linkDependency('@embroider/addon-shim', { baseDir: __dirname });
  addon.pkg.keywords = addon.pkg.keywords ? [...addon.pkg.keywords, 'ember-addon'] : ['ember-addon'];
  addon.pkg.type = 'module';
  addon.pkg['ember-addon'] = {
    version: 2,
    type: 'addon',
    main: './addon-main.cjs',
  };
  // This is the conditional exports pattern that causes issues with directory imports.
  // The "./*" pattern maps to "./dist/*.js" which adds .js extension,
  // preventing directory -> index.js resolution.
  addon.pkg.exports = {
    '.': {
      'types': './declarations/index.d.ts',
      'default': './dist/index.js',
    },
    './*': {
      'types': './declarations/*.d.ts',
      'default': './dist/*.js',
    },
  };
  return addon;
}

let scenarios = appScenarios.skip('lts').map('v2-addon', project => {
  project.addDevDependency(buildV2Addon());
  project.addDevDependency(buildIntermediateV1Addon());
  project.addDevDependency(buildV2AddonWithExports('fourth-v2-addon'));
  project.addDevDependency(buildV2AddonWithMacros());
  project.addDevDependency(buildV2AddonWithDevDep());
  project.addDevDependency(buildV2AddonWithSelfImport());
  project.addDevDependency(buildV2AddonWithIndexResolution());
  project.addDevDependency(buildV2AddonWithConditionalExports());

  // apps don't necessarily need a directly dependency on @embroider/macros just
  // because they have a v2 addon that contains some macros, but in this test
  // the app is going to explicitly pass some macro config, which is why it
  // needs this dependency.
  project.linkDevDependency('@embroider/macros', { baseDir: __dirname });

  merge(project.files, {
    'ember-cli-build.js': `
      const EmberApp = require('ember-cli/lib/broccoli/ember-app');
      module.exports = function (defaults) {
        let app = new EmberApp(defaults, {
          '@embroider/macros': {
            setConfig: {
              'macro-using-addon': {
                message: 'hello from the app',
              }
            }
          }
        });
        return app.toTree();
      };
    `,
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
            export { macroExample } from 'macro-using-addon';
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
      // This file intentionally has the same path as the addon's internal module
      // to test that addon self-imports work even with naming conflicts.
      // See: https://github.com/embroider-build/ember-auto-import/issues/681
      utils: {
        'helper.js': `
          // This is the APP's helper, NOT the addon's helper
          export function appHelper() {
            return 'app-helper-value';
          }
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
        'macro-using-test.js': `
          import { macroExample } from '@ef4/app-template/lib/exercise';
          import { module, test } from 'qunit';
          module('Unit | v2-addon with macros', function () {
            test('the addon successully ran the macros', function(assert) {
              assert.deepEqual(macroExample(), 'hello from the app');
            });
          });
        `,
        'renamed-modules-test.js': `
          import { module, test } from 'qunit';
          import special from 'special-module';
          import customized from 'customization-target';

          module('Unit | v2 addon renamed-modules', function () {
            test('can import from v2 addon with renamed-modules', function (assert) {
              assert.equal(special(), 'from a renamed module');
            });
            test('addon was able to customize its renamed-modules metadata', function(assert) {
              assert.equal(customized(), 'from customized target');
            });
          })

          module('Unit | v2 addon implicit-modules', function () {
            test('addon can inject implicit-modules', function (assert) {
              assert.strictEqual(globalThis.require('my-v2-addon/implicitly-included').default(), 'my-v2-addon implicit module')
            })
            test('addon with exports, customizeMeta, and renamed-modules can inject implicit-modules', function (assert) {
              assert.strictEqual(globalThis.require('renamed-fourth-v2-addon/implicit').default(), 'fourth-v2-addon implicit module')
            })
          });
        `,
        'addon-dev-dep-test.js': `
          import makeObject from 'with-dev-dep';
          import { module, test } from 'qunit';
          module('Unit | v2-addon with dev-dep', function () {
            test('should not consume dev-dep from npm', function(assert) {
               assert.ok(makeObject(), 'this will throw if we actually consume the dev dep from npm');
            });
          });
        `,
        // Test for issue #681: v2 addon self-imports with naming conflicts
        // https://github.com/embroider-build/ember-auto-import/issues/681
        'self-import-test.js': `
          import { module, test } from 'qunit';
          // The addon uses self-imports with its package name internally.
          // This should work even though the app has a conflicting utils/helper.js file.
          import { addonMain } from 'addon-self-import';
          import { myComponent } from 'addon-self-import/components/my-component';
          // Also import the app's helper to prove both exist and are separate
          import { appHelper } from '@ef4/app-template/utils/helper';

          module('Unit | v2 addon self-import with naming conflict', function () {
            test('addon can import from itself using package name', function (assert) {
              // addonMain internally imports from 'addon-self-import/utils/helper'
              // This should resolve to the addon's helper, not the app's helper
              assert.equal(addonMain(), 'addon-main:addon-helper-value', 'addon self-import should work');
            });

            test('addon component can import from addon using package name', function (assert) {
              // myComponent also internally imports from 'addon-self-import/utils/helper'
              assert.equal(myComponent(), 'my-component:addon-helper-value', 'component self-import should work');
            });

            test('app helper is separate from addon helper', function (assert) {
              // The app has its own utils/helper.js that should not interfere
              assert.equal(appHelper(), 'app-helper-value', 'app helper should be separate');
            });
          });
        `,
        // Test for fullySpecified: false fix - ESM directory imports
        // This tests that v2 addons with "type": "module" can use directory imports
        // that resolve to index.js without webpack requiring explicit paths.
        'index-resolution-test.js': `
          import { module, test } from 'qunit';
          // Test the main export which internally imports from a directory without /index.js
          // This tests ESM-to-ESM imports within a type:module package.
          // Without fullySpecified: false, the internal import would fail.
          import { mainExport } from 'addon-with-index';
          import { anotherComponent } from 'addon-with-index/components/another-component';
          // Also test that explicit file imports still work
          import { helper } from 'addon-with-index/components/another-component/helper.js';

          module('Unit | v2 addon index.js resolution with type module', function () {
            test('internal ESM imports resolve directories to index.js', function (assert) {
              // mainExport internally imports from './components/my-component' (no /index.js)
              // This tests that fullySpecified: false allows directory resolution
              assert.equal(mainExport(), 'addon-with-index-main:my-component-from-index', 'internal import should resolve');
            });

            test('can import from directory with index.js', function (assert) {
              assert.equal(anotherComponent(), 'another-component-from-index', 'another-component should resolve to index.js');
            });

            test('can still import explicit .js files from component directories', function (assert) {
              assert.equal(helper(), 'helper-from-another-component', 'explicit file imports should work');
            });
          });
        `,
        // Test for conditional exports pattern: "./*": { "default": "./dist/*.js" }
        // This pattern is commonly used by v2 addons but causes issues with directory imports
        // because the exports field adds .js extension, preventing index.js resolution.
        //
        // ember-auto-import handles this with the ExportsIndexFallbackPlugin which:
        // 1. Detects when a .js file doesn't exist but a directory/index.js does
        // 2. Resolves to the index.js file
        // 3. Shows a warning in development mode about the misconfigured exports
        'conditional-exports-test.js': `
          import { module, test } from 'qunit';
          // Main export should work - uses explicit "./dist/index.js" in exports
          import { mainExport } from 'addon-conditional-exports';
          // Flat file import should work - "components/flat-component" -> "dist/components/flat-component.js"
          import { flatComponent } from 'addon-conditional-exports/components/flat-component';
          // Directory import with index.js - this WOULD fail without ExportsIndexFallbackPlugin:
          //   - exports maps: components/dir-component -> dist/components/dir-component.js
          //   - but actual file is: dist/components/dir-component/index.js
          // The plugin detects this and resolves to index.js with a dev warning.
          import { dirComponent } from 'addon-conditional-exports/components/dir-component';

          module('Unit | v2 addon conditional exports with .js pattern', function () {
            test('main export works with conditional exports', function (assert) {
              assert.equal(mainExport(), 'conditional-exports-main', 'main export should work');
            });

            test('flat file imports work with .js exports pattern', function (assert) {
              // This works because: components/flat-component -> dist/components/flat-component.js (file exists)
              assert.equal(flatComponent(), 'flat-component-value', 'flat component should work');
            });

            test('directory imports with index.js work via ExportsIndexFallbackPlugin', function (assert) {
              // Without the plugin, this would fail because exports maps to .js file
              // that doesn't exist. The plugin detects this and resolves to index.js.
              // In development mode, a warning is logged about the misconfigured exports.
              assert.equal(dirComponent(), 'dir-component-from-index', 'directory component should resolve to index.js');
            });
          });
        `,
      },
    },
  });

  project.linkDependency('ember-auto-import', { baseDir: __dirname });
  project.linkDependency('webpack', { baseDir: __dirname });
  project.linkDependency('ember-cli-fastboot', { baseDir: __dirname });
});

scenarios.forEachScenario(scenario => {
  Qmodule(scenario.name, function (hooks) {
    let app: PreparedApp;
    hooks.before(async () => {
      app = await scenario.prepare();
    });
    test('yarn test', async function (assert) {
      let result = await app.execute('pnpm  run test');
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

Scenarios.fromProject(baseApp)
  .map('shim-requires-auto-import', project => {
    let v1Addon = baseAddon();
    v1Addon.name = 'my-v1-addon';
    v1Addon.addDependency(buildV2AddonWithExports('my-v2-addon'));
    project.addDependency(v1Addon);
    project.linkDevDependency('ember-auto-import', { baseDir: __dirname });
    project.linkDependency('webpack', { baseDir: __dirname });
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
          /my-v1-addon needs to depend on ember-auto-import in order to use my-v2-addon/.test(result.stderr),
          result.stderr
        );
      });
    });
  });

Scenarios.fromProject(baseApp)
  .map('v2-addon-consumed-by-v1-addon-cross-talk-with-requirejs-and-webpack', async project => {
    let v2Addon = baseV2Addon();
    v2Addon.pkg.name = 'v2-addon';
    merge(v2Addon.files, {
      dist: {
        'index.js': `
        import { things } from 'v1-addon';
        const result = things();
        export function theResult() {
          return result;
        }
      `,
      },
    });
    v2Addon.pkg['exports'] = {
      '.': './dist/index.js',
    };
    v2Addon.pkg.peerDependencies ||= {};
    v2Addon.pkg.peerDependencies['v1-addon'] = '*';

    let v1Addon = baseAddon();
    v1Addon.pkg.name = 'v1-addon';
    merge(v1Addon.files, {
      addon: {
        'index.js': `
        export function things() {
          return 'it worked'
        }
      `,
      },
    });

    project.addDependency(v2Addon);
    project.addDependency(v1Addon);

    project.linkDependency('ember-auto-import', { baseDir: __dirname });
    project.linkDependency('webpack', { baseDir: __dirname });

    merge(project.files, {
      tests: {
        unit: {
          'dep-chain-test.js': `
          import { module, test } from 'qunit';
          import { theResult } from 'v2-addon';
          import 'v1-addon';

          module('Unit | import from chain', function() {
            test('it worked', function(assert) {
              assert.strictEqual(theResult(), 'it worked');
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
      test('ensure success', async function (assert) {
        let result = await app.execute('pnpm  run test');
        assert.strictEqual(result.exitCode, 0, result.output);
      });
    });
  });
