import { appScenarios } from './scenarios';
import { PreparedApp } from 'scenario-tester';
import QUnit from 'qunit';
import merge from 'lodash/merge';
const { module: Qmodule, test } = QUnit;

appScenarios
  .map('layering', project => {
    const commonFiles = {
      files: {
        'index.js': `
          export { checkId } from "inner-lib/singleton.js";
        `,
      },
    };
    let outerLib = project.addDevDependency('outer-lib', commonFiles);
    outerLib.pkg.peerDependencies = {
      'inner-lib': '*',
    };

    let secondOuterLib = project.addDevDependency('second-outer-lib', commonFiles);
    secondOuterLib.pkg.peerDependencies = {
      'inner-lib': '*',
    };

    project.addDependency('inner-lib', {
      files: {
        'singleton.js': `

        if (typeof globalThis.innerLibCount == 'undefined') {
          globalThis.innerLibCount = 0;
        }
        const myId = globalThis.innerLibCount++;
        export function checkId() {
          return myId;
        }
          `,
      },
    });

    // top-level auto-import is mandatory
    project.linkDependency('ember-auto-import', { baseDir: __dirname });
    project.linkDependency('webpack', { baseDir: __dirname });

    merge(project.files, {
      app: {
        'lib-export.js': 'export { checkId } from "outer-lib";',
      },
      tests: {
        unit: {
          'check-inner-lib-test.js': `import {checkId as appCheckId } from '@ef4/app-template/lib-export';
          import {checkId as testCheckId } from 'second-outer-lib';

          import { module, test } from 'qunit';

          module('Unit | check libs', function (hooks) {

            test('app-dep and test-dep see the same instance of a peer', async function (assert) {
              assert.equal(appCheckId(), testCheckId(), 'the values returned from the re-exported functions should always be the same');
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
        let result = await app.execute('pnpm  run test');
        assert.equal(result.exitCode, 0, result.output);
      });
    });
  });
