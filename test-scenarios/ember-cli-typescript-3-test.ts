import merge from 'lodash/merge';
import { appScenarios } from './scenarios';
import { PreparedApp, Project } from 'scenario-tester';
import QUnit from 'qunit';
const { module: Qmodule, test } = QUnit;

appScenarios
  .skip('lts')
  .map('ember-cli-typescript-3', project => {
    let aDependency = new Project({
      files: {
        'package.json': '{ "name": "a-dependency", "version": "0.0.1" }',
        'index.js': "module.exports = function() { return 'ember-auto-import-a-dependency'; }",
        flavors: {
          'chocolate.js': 'export const name = "chocolate";',
          'vanilla.js': 'export const name = "vanilla";',
        },
      },
    });
    project.addDevDependency(aDependency);

    let aPureTSDependency = new Project({
      files: {
        'package.json': '{ "name": "a-pure-ts-dependency", "version": "0.0.1" }',
        // Project has a default index.js file, which we need to delete so it
        // doesn't take precedence over our index.ts
        'index.js': null,
        'index.ts': "export default function() { return 'ember-auto-import-a-pure-ts-dependency'; } ",
        'js-takes-precedence.ts':
          "export default function() { return 'ember-auto-import-ts-takes-precedence-WRONG'; } ",
        'js-takes-precedence.js': "export default function() { return 'ember-auto-import-js-takes-precedence'; } ",
      },
    });
    project.addDevDependency(aPureTSDependency);

    project.linkDevDependency('ember-auto-import', { baseDir: __dirname });
    project.linkDevDependency('ember-cli-typescript', { baseDir: __dirname, resolveName: 'ember-cli-typescript-3' });
    project.linkDevDependency('typescript', { baseDir: __dirname, resolveName: 'typescript-4' });

    merge(project.files, {
      app: {
        controllers: {
          'application.ts': APPLICATION_TS,
        },
        templates: {
          'application.hbs': APPLICATION_HBS,
        },
        config: {
          'environment.d.ts': ENVIROMENT_D_TS,
        },
      },
      tests: {
        acceptance: {
          'basic-test.js': BASIC_TEST_JS,
        },
      },
      'tsconfig.json': TSCONFIG_JSON,
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

const APPLICATION_TS = `
  import Controller from '@ember/controller';
  import { computed } from '@ember/object';
  import jsDependency from 'a-dependency';
  import tsDependency from 'a-pure-ts-dependency';
  import precedenceDependency from 'a-pure-ts-dependency/js-takes-precedence';

  export default class extends Controller {
    @computed()
    get jsDependency() {
      return jsDependency();
    }

    @computed()
    get tsDependency() {
      return tsDependency();
    }

    @computed()
    get precedenceDependency() {
      return precedenceDependency();
    }
  }`;

const APPLICATION_HBS = `
  <div data-test-import-js>{{this.jsDependency}}</div>
  <div data-test-import-ts>{{this.tsDependency}}</div>
  <div data-test-import-precedence>{{this.precedenceDependency}}</div>
  `;

const ENVIROMENT_D_TS = `
  export default config;
  declare const config: {
    environment: any;
    modulePrefix: string;
    podModulePrefix: string;
    locationType: string;
    rootURL: string;
  };
  `;

const BASIC_TEST_JS = `
  import { module, test } from 'qunit';
  import { visit } from '@ember/test-helpers';
  import { setupApplicationTest } from 'ember-qunit';

  module('Acceptance | basic', function(hooks) {
    setupApplicationTest(hooks);

    test('visiting /basic', async function(assert) {
      await visit('/');
      assert.equal(document.querySelector('[data-test-import-js]').textContent.trim(), 'ember-auto-import-a-dependency');
      assert.equal(document.querySelector('[data-test-import-ts]').textContent.trim(), 'ember-auto-import-a-pure-ts-dependency');
      assert.equal(document.querySelector('[data-test-import-precedence]').textContent.trim(), 'ember-auto-import-js-takes-precedence');
    });
  });
  `;

const TSCONFIG_JSON = `
  {
    "compilerOptions": {
      "target": "es2017",
      "allowJs": true,
      "moduleResolution": "node",
      "allowSyntheticDefaultImports": true,
      "noImplicitAny": true,
      "noImplicitThis": true,
      "alwaysStrict": true,
      "strictNullChecks": true,
      "strictPropertyInitialization": true,
      "noFallthroughCasesInSwitch": true,
      "experimentalDecorators": true,
      "noUnusedLocals": true,
      "noUnusedParameters": true,
      "noImplicitReturns": true,
      "noEmitOnError": false,
      "noEmit": true,
      "inlineSourceMap": true,
      "inlineSources": true,
      "baseUrl": ".",
      "module": "es6",
      "paths": {
        "tests/*": ["tests/*"],
        "app/*": ["app/*"],
        "*": ["types/*"]
      }
    },
    "include": ["app/**/*", "tests/**/*", "types/**/*"]
  }
  `;
