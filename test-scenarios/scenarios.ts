import { Scenarios, Project } from 'scenario-tester';
import { dirname } from 'path';
import { merge } from 'lodash';

// this scenario represents the oldest Ember LTS we support
function lts(mode: 'app' | 'addon') {
  return async function (project: Project) {
    project.linkDevDependency('ember-cli', { baseDir: __dirname, resolveName: 'ember-cli-lts' });
    project.linkDevDependency('ember-source', { baseDir: __dirname, resolveName: 'ember-source-lts' });
    project.linkDevDependency('@ember/test-helpers', { baseDir: __dirname, resolveName: 'ember-test-helpers-lts' });
    project.linkDevDependency('ember-qunit', { baseDir: __dirname, resolveName: 'ember-qunit-5' });

    if (mode === 'app') {
      project.linkDevDependency('ember-cli-htmlbars', { baseDir: __dirname, resolveName: 'ember-cli-htmlbars6' });
    } else {
      project.linkDependency('ember-cli-htmlbars', { baseDir: __dirname, resolveName: 'ember-cli-htmlbars6' });
    }

    project.mergeFiles({
      '.npmrc': `
      use-node-version=12.22.1
    `,
    });

    // this version of ember doesn't support native class syntax here (which is
    // what we have in our base app and addon templates)
    function olderAppJS(moduleName: string) {
      return `
  import Application from '@ember/application';
  import Resolver from 'ember-resolver';
  import loadInitializers from 'ember-load-initializers';
  import config from '${moduleName}/config/environment';

  const App = Application.extend({
    modulePrefix: config.modulePrefix,
    podModulePrefix: config.podModulePrefix,
    Resolver
  })

  loadInitializers(App, config.modulePrefix);
  export default App
`;
    }

    // this wasn't a thing in ember 3.4
    project.removeDevDependency('@glimmer/tracking');

    if (project.name === '@ef4/app-template') {
      merge(project.files, {
        config: {
          'targets.js': `
          module.exports = {
            browsers: ['ie 11']
          };
        `,
        },
        app: {
          'app.js': olderAppJS('@ef4/app-template'),
        },
      });
      // ember-welcome-page 6 doesn't support our oldest LTS
      project.linkDevDependency('ember-welcome-page', { baseDir: __dirname, resolveName: 'ember-welcome-page5' });
    } else if (project.name === '@ef4/addon-template') {
      merge(project.files, {
        tests: {
          dummy: {
            app: {
              'app.js': olderAppJS('dummy'),
            },
            config: {
              'targets.js': `
              module.exports = {
                browsers: ['ie 11']
              };
            `,
            },
          },
        },
      });
    }
  };
}

// this scenario represents the last Ember 3.x release
async function ember3(project: Project) {
  project.linkDevDependency('ember-cli', { baseDir: __dirname, resolveName: 'ember-cli-3' });
  project.linkDevDependency('ember-source', { baseDir: __dirname, resolveName: 'ember-source-3' });
  project.linkDevDependency('@ember/test-helpers', { baseDir: __dirname, resolveName: 'ember-test-helpers-lts' });
  project.linkDevDependency('ember-qunit', { baseDir: __dirname, resolveName: 'ember-qunit-5' });
}

// the current ember release
async function release(project: Project) {
  project.linkDevDependency('ember-cli', { baseDir: __dirname, resolveName: 'ember-cli-latest' });
  project.linkDevDependency('ember-source', { baseDir: __dirname, resolveName: 'ember-source-latest' });
}

function releaseWithModules(mode: 'app' | 'addon') {
  return async function (project: Project) {
    release(project);

    let config = {
      // the important one here we're testing is use-ember-modules
      'optional-features.json': `
        {
          "use-ember-modules": true,
          "application-template-wrapper": false,
          "default-async-observers": true,
          "jquery-integration": false,
          "template-only-glimmer-components": true
        }
      `,
    };

    if (mode === 'app') {
      merge(project.files, {
        config,
      });
    } else {
      merge(project.files, {
        tests: {
          dummy: { config },
        },
      });
    }
  };
}

async function beta(project: Project) {
  project.linkDevDependency('ember-cli', { baseDir: __dirname, resolveName: 'ember-cli-beta' });
  project.linkDevDependency('ember-source', { baseDir: __dirname, resolveName: 'ember-source-beta' });
}

async function canary(project: Project) {
  // ember-cli canary is not aliased in our package.json, because NPM doesn't support
  // aliasing of non-registry deps
  project.linkDevDependency('ember-cli', { baseDir: __dirname, resolveName: 'ember-cli' });
  project.linkDevDependency('ember-source', { baseDir: __dirname, resolveName: 'ember-source-canary' });
}

export function supportMatrix(scenarios: Scenarios, mode: 'app' | 'addon') {
  return scenarios.expand({
    lts: lts(mode),
    ember3,
    release,
    releaseWithModules: releaseWithModules(mode),
    beta,
    canary,
  });
}

export function baseApp() {
  return Project.fromDir(dirname(require.resolve('@ef4/app-template/package.json')), { linkDevDeps: true });
}
export const appScenarios = supportMatrix(Scenarios.fromProject(baseApp), 'app');

export function baseAddonInProject(project: Project) {
  let output = Project.fromDir(dirname(require.resolve('@ef4/addon-template/package.json')), {
    linkDeps: true,
  });
  if ((project as any).dependencyLinks.get('ember-cli-htmlbars')?.resolveName === 'ember-cli-htmlbars6') {
    output.linkDependency('ember-cli-htmlbars', { baseDir: __dirname, resolveName: 'ember-cli-htmlbars6' });
  }
  return output;
}

export function baseV2Addon() {
  return Project.fromDir(dirname(require.resolve('@ef4/v2-addon-template/package.json')), {
    linkDeps: true,
    linkDevDeps: true,
  });
}

export const addonScenarios = supportMatrix(
  Scenarios.fromProject(() => {
    return Project.fromDir(dirname(require.resolve('@ef4/addon-template/package.json')), {
      linkDeps: true,
      linkDevDeps: true,
    });
  }),
  'addon'
);
