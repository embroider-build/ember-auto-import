import merge from 'lodash/merge';
import { appScenarios } from './scenarios';
import { PreparedApp, Project } from 'scenario-tester';
import QUnit from 'qunit';
const { module: Qmodule, test } = QUnit;

appScenarios
  .map('skip-babel', project => {
    let aModuleDependency = new Project({
      files: {
        'package.json': '{ "name": "a-module-dependency", "version": "0.0.1" }',
        'index.js': `
          function returnUndefined() {
            // this should throw an error unless it's been transpiled
            return foo;
            let foo = 123;
          }

          export default function aModuleDependency() {
            try {
              if (returnUndefined() === undefined) {
                return 'module transpiled';
              }
            } catch (e) {
              return 'module not transpiled';
            }
          }`,
      },
    });
    project.addDevDependency(aModuleDependency);
    project.linkDevDependency('ember-auto-import', { baseDir: __dirname });

    merge(project.files, {
      'ember-cli-build.js': EMBER_CLI_BUILD_JS,
      app: {
        controllers: {
          'application.js': APPLICATION_JS,
        },
        templates: {
          'application.hbs': '<div data-test-import-result>{{moduleResult}}</div>',
        },
      },
      tests: {
        acceptance: {
          'basic-test.js': BASIC_TEST_JS,
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
        let result = await app.execute('npm run test');
        assert.equal(result.exitCode, 0, result.output);
      });
    });
  });

const EMBER_CLI_BUILD_JS = `
'use strict';

const EmberApp = require('ember-cli/lib/broccoli/ember-app');

module.exports = function(defaults) {
  let app = new EmberApp(defaults, {
    autoImport: {
      skipBabel: [{
        package: 'a-module-dependency',
        semverRange: '*'
      }]
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
    assert.dom('[data-test-import-result]').hasText('module not transpiled');
  });
});
  `;
