import merge from 'lodash/merge';
import { appScenarios } from './scenarios';
import { PreparedApp, Project } from 'scenario-tester';
import QUnit from 'qunit';
const { module: Qmodule, test } = QUnit;

appScenarios
  .map('babel', project => {
    let aModuleDependency = new Project({
      files: {
        'package.json': '{ "name": "a-module-dependency", "version": "0.0.1" }',
        'index.js': `
          export default function aModuleDependency() {
              if (typeof __EAI_WATERMARK__ === "string" && __EAI_WATERMARK__ === "successfully watermarked") {
                return 'module transpiled with cleanBabelConfig';
              } else {
                return 'module not transpiled with cleanBabelConfig';
              }
          }`,
      },
    });

    let bModuleDependency = new Project({
      files: {
        'package.json': '{ "name": "b-module-dependency", "version": "0.1.1" }',
        'index.js': `
          export function externalLibUsingTranspileTargetFunction() {
            try {
              return TRANSPILE_TARGET();
            } catch (e) {
              return "this function has not been transpiled with our custom babel config";
            }
          }

          export function needsToBeTranspiled() {
            if (typeof __EAI_WATERMARK__ === "string" && __EAI_WATERMARK__ === "successfully watermarked") {
              return 'module transpiled with cleanBabelConfig';
            } else {
              return 'module not transpiled with cleanBabelConfig';
            }
          }`,
      },
    });
    project.addDevDependency(aModuleDependency);
    project.addDevDependency(bModuleDependency);
    project.linkDevDependency('ember-auto-import', { baseDir: __dirname });
    project.linkDependency('webpack', { baseDir: __dirname });

    merge(project.files, {
      'ember-cli-build.js': EMBER_CLI_BUILD_JS,
      app: {
        lib: {
          'example1.js': `export default function() {
             return TRANSPILE_TARGET();
           }

           export function ensureNotWatermarked() {
            return typeof __EAI_WATERMARK__ === "undefined"
           }
           `,
        },
        controllers: {
          'application.js': APPLICATION_JS,
        },
        templates: {
          'application.hbs': '<div data-test-import-result>{{this.moduleResult}}</div>',
        },
      },
      tests: {
        acceptance: {
          'basic-test.js': BASIC_TEST_JS,
        },
        unit: {
          'babel-transform-app-code-test.js': `
            import { module, test } from 'qunit';
            import example1, { ensureNotWatermarked } from '@ef4/app-template/lib/example1';

            import { needsToBeTranspiled, externalLibUsingTranspileTargetFunction} from 'b-module-dependency';

            module('Unit | babel-transform-app-code tests', function () {
              test('it successfully transforms code imported using allowAppImports', function (assert) {
                assert.equal(example1(), 'it woked');
                assert.ok(ensureNotWatermarked(), 'app code doesnt get 3rd party babel config');
              });

              test('it transpiles external deps but doesnt use the apps config', function(assert) {
                assert.equal(needsToBeTranspiled(), 'module transpiled with cleanBabelConfig');
                assert.equal(externalLibUsingTranspileTargetFunction(), 'this function has not been transpiled with our custom babel config');
              })
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
      test('yarn test', async function (assert) {
        let result = await app.execute('pnpm  run test');
        assert.equal(result.exitCode, 0, result.output);
      });
    });
  });

const EMBER_CLI_BUILD_JS = `
process.env.USE_EAI_BABEL_WATERMARK = 'true';
'use strict';

const EmberApp = require('ember-cli/lib/broccoli/ember-app');

module.exports = function(defaults) {
  let app = new EmberApp(defaults, {
    babel: {
      plugins: [
        function testTransform(babel) {
          return {
            visitor: {
              CallExpression(path) {
                let callee = path.get('callee');
                if (!callee.isIdentifier()) {
                  return;
                }
                if (callee.node.name === 'TRANSPILE_TARGET') {
                  path.replaceWith(babel.types.stringLiteral("it woked"))
                }
              }
            }
          }
        }
      ]
    },
    autoImport: {
      skipBabel: [{
        package: 'a-module-dependency',
        semverRange: '*'
      }],
      allowAppImports: [
        'lib/**'
      ]
    }
  });

  return app.toTree();
};
`;

const APPLICATION_JS = `
import Controller from '@ember/controller';
import { computed } from '@ember-decorators/object';
import aModuleDependency from 'a-module-dependency';

export default class extends Controller {
  @computed()
  get moduleResult() {
    return aModuleDependency();
  }
}
`;

const BASIC_TEST_JS = `
import { module, test } from 'qunit';
import { visit } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';

module('Acceptance | basic', function(hooks) {
  setupApplicationTest(hooks);

  test('visiting /basic', async function(assert) {
    await visit('/');
    assert.dom('[data-test-import-result]').hasText('module not transpiled with cleanBabelConfig');
  });
});
  `;
