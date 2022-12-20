import { Scenarios, Project } from 'scenario-tester';
import { dirname } from 'path';
import { merge } from 'lodash';

if (
  require('../packages/ember-auto-import/package.json').version !==
  require('./package.json').devDependencies['ember-auto-import']
) {
  throw new Error(
    `version safety check failure. test-scenarios is not depending on the current verion of ember-auto-import`
  );
}

// this scenario represents the oldest Ember LTS we support
async function lts(project: Project) {
  project.linkDevDependency('ember-cli', { baseDir: __dirname, resolveName: 'ember-cli-lts' });
  project.linkDevDependency('ember-source', { baseDir: __dirname, resolveName: 'ember-source-lts' });

  project.pkg.volta = {
    node: '12.22.1',
  };

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

  if (project.name === '@ef4/app-template') {
    merge(project.files, {
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
        },
      },
    });
  }
}

// this scenario represents the last Ember 3.x release
async function ember3(project: Project) {
  project.linkDevDependency('ember-cli', { baseDir: __dirname, resolveName: 'ember-cli-3' });
  project.linkDevDependency('ember-source', { baseDir: __dirname, resolveName: 'ember-source-3' });
}

// the current ember release
async function release(project: Project) {
  project.linkDevDependency('ember-cli', { baseDir: __dirname, resolveName: 'ember-cli-latest' });
  project.linkDevDependency('ember-source', { baseDir: __dirname, resolveName: 'ember-source-latest' });
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

export function supportMatrix(scenarios: Scenarios) {
  return scenarios.expand({
    lts,
    ember3,
    release,
    beta,
    canary,
  });
}

export function baseApp() {
  return Project.fromDir(dirname(require.resolve('@ef4/app-template/package.json')), { linkDevDeps: true });
}
export const appScenarios = supportMatrix(Scenarios.fromProject(baseApp));

export function baseAddon(as: 'addon' | 'dummy-app' = 'addon') {
  return Project.fromDir(dirname(require.resolve('@ef4/addon-template/package.json')), {
    linkDeps: true,
    linkDevDeps: as === 'dummy-app',
  });
}

export function baseV2Addon() {
  return Project.fromDir(dirname(require.resolve('@ef4/v2-addon-template/package.json')), {
    linkDeps: true,
    linkDevDeps: true,
  });
}

export const addonScenarios = supportMatrix(Scenarios.fromProject(() => baseAddon('dummy-app')));
