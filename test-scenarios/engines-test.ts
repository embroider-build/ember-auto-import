import { appScenarios } from './scenarios';
import { PreparedApp, Project } from 'scenario-tester';
import QUnit from 'qunit';
import merge from 'lodash/merge';
import { dirname } from 'path';
const { module: Qmodule, test } = QUnit;

// Both ember-engines and its dependency ember-asset-loader have undeclared
// peerDependencies on ember-cli.
function emberEngines(): Project {
  let enginesPath = dirname(require.resolve('ember-engines/package.json'));
  let engines = Project.fromDir(enginesPath, { linkDeps: true });
  engines.pkg.peerDependencies = Object.assign({ 'ember-cli': '*' }, engines.pkg.peerDependencies);
  let assetLoader = Project.fromDir(dirname(require.resolve('ember-asset-loader', { paths: [enginesPath] })), {
    linkDeps: true,
  });
  assetLoader.pkg.peerDependencies = Object.assign({ 'ember-cli': '*' }, assetLoader.pkg.peerDependencies);
  engines.addDependency(assetLoader);
  return engines;
}

function createInRepoEngine(project: Project, engineName: string) {
  project.addDependency(emberEngines());

  project.pkg['ember-addon'] = {
    paths: [`lib/${engineName}`],
  };

  merge(project.files, {
    lib: {
      [engineName]: {
        node_modules: {
          'fake-package': {
            'package.json': `{
              "name": "fake-package"
            }`,
            'index.js': `module.exports = function() {
  return 'fake-package';
}`,
          },
        },
        'index.js': `const EngineAddon = require('ember-engines/lib/engine-addon');
module.exports = EngineAddon.extend({
  name: '${engineName}',
  lazyLoading: {
    enabled: true,
  },
});`,
        'package.json': `{
  "name": "${engineName}",
  "keywords": [
    "ember-addon",
    "ember-engine"
  ],
  "dependencies": {
    "ember-auto-import": "*",
    "ember-cli-htmlbars": "*",
    "ember-cli-babel": "*",
    "webpack": "*",
    "fake-package": "*"
  },
  "devDependencies": {
    "ember-engines": "*"
  },
  "volta": {
    "extends": "../../package.json"
  }
}`,
        config: {
          'environment.js': `/* eslint-env node */
'use strict';

module.exports = function(environment) {
let ENV = {
  modulePrefix: '${engineName}',
  environment
};

return ENV;
};`,
        },
        addon: {
          routes: {
            'application.js': `import Route from '@ember/routing/route';
import fakePkg from 'fake-package';

export default class ApplicationRoute extends Route {
  model() {
    return {
      pkgName: fakePkg(),
    };
  }
}`,
          },
          templates: {
            'application.hbs': `<p data-test-pkg-name>{{this.model.pkgName}}</p>`,
          },
          'engine.js': `import Engine from 'ember-engines/engine';
import loadInitializers from 'ember-load-initializers';
import Resolver from './resolver';
import config from './config/environment';

const { modulePrefix } = config;

const Eng = Engine.extend({
  modulePrefix,
  Resolver
});

loadInitializers(Eng, modulePrefix);

export default Eng;`,
          'resolver.js': `import Resolver from 'ember-resolver';
export default Resolver;`,
          'routes.js': `import buildRoutes from 'ember-engines/routes';
export default buildRoutes(function () {});`,
        },
      },
    },
  });
}

// This is testing that an inrepo lazy engine which imports (via auto-import) a plain
// npm package works correctly (ie the npm package should not be eagerly added).
appScenarios
  .skip('release') // ember-engines doesn't have an ember 4.0 compatible release yet.
  .map('engines', project => {
    project.linkDependency('ember-auto-import', { baseDir: __dirname });
    project.linkDependency('webpack', { baseDir: __dirname });

    createInRepoEngine(project, 'lazy-in-repo-engine');

    merge(project.files, {
      app: {
        'router.js': `import EmberRouter from '@ember/routing/router';
import config from './config/environment';

const Router = EmberRouter.extend({
  location: config.locationType,
  rootURL: config.rootURL,
});

Router.map(function() {
  this.mount('lazy-in-repo-engine', { path: '/use-lazy-engine', as: 'use-lazy-engine' });
});

export default Router;`,
      },
      tests: {
        acceptance: {
          'basic-test.js': `import { module, test } from 'qunit';
import { visit } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';

module('Acceptance | basics', function (hooks) {
  setupApplicationTest(hooks);

  test('importing a plain npm pacakge from a lazy engines does not add the package eagerly', async function (assert) {
    assert.equal(requirejs.entries['fake-package'], undefined, 'fake-package should not be loaded before visting lazy engine');
    await visit('/use-lazy-engine');
    assert.equal(typeof requirejs.entries['fake-package'], 'object', 'fake-package was loaded only after visting the engine');
    assert
      .dom('[data-test-pkg-name]')
      .hasText('fake-package', 'The fake-package was correctly imported');
  });
});`,
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

      test(`yarn test`, async function (assert) {
        let result = await app.execute('yarn test');
        assert.equal(result.exitCode, 0, result.output);
      });
    });
  });
