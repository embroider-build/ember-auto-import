import merge from 'lodash/merge';
import { Scenarios } from 'scenario-tester';
import { baseApp } from './scenarios';
import { PreparedApp } from 'scenario-tester';
import QUnit from 'qunit';
const { module: Qmodule, test } = QUnit;

let template = Scenarios.fromProject(baseApp);

template
  .map('node ES modules', project => {
    project.linkDevDependency('ember-auto-import', { baseDir: __dirname });
    // Support for ember-cli internally to respect `ember-cli-build.cjs` landed in https://github.com/ember-cli/ember-cli/pull/10053
    project.linkDevDependency('ember-cli', { baseDir: __dirname });
    project.linkDependency('webpack', { baseDir: __dirname });

    project.files['ember-cli-build.cjs'] = project.files['ember-cli-build.js'];
    delete project.files['ember-cli-build.js'];

    project.files['testem.cjs'] = project.files['testem.js'];
    delete project.files['testem.js'];

    project.pkg.type = 'module';
    project.pkg.scripts = project.pkg.scripts || {};
    project.pkg.scripts.test = 'node ./node_modules/ember-cli/bin/ember test --config-file testem.cjs';
    merge(project.files, {
      config: {
        'package.json': JSON.stringify({ type: 'commonjs' }),
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
        console.log(app.dir);
        let result = await app.execute('volta run npm -- run test');
        assert.equal(result.exitCode, 0, result.output);
      });
    });
  });
