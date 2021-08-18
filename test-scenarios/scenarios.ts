import { Scenarios, Project } from 'scenario-tester';
import { dirname, delimiter } from 'path';
import { merge } from 'lodash';

// https://github.com/volta-cli/volta/issues/702
// We need this because we're launching node in child processes and we want
// those children to respect volta config per project.
(function restoreVoltaEnvironment() {
  let voltaHome = process.env['VOLTA_HOME'];
  if (!voltaHome) return;
  let paths = process.env['PATH']!.split(delimiter);
  while (/\.volta/.test(paths[0])) {
    paths.shift();
  }
  paths.unshift(`${voltaHome}/bin`);
  process.env['PATH'] = paths.join(delimiter);
})();

if (
  require('../packages/ember-auto-import/package.json').version !==
  require('./package.json').devDependencies['ember-auto-import']
) {
  throw new Error(
    `version safety check failure. test-scenarios is not depending on the current verion of ember-auto-import`
  );
}

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
  project.linkDevDependency('ember-resolver', { baseDir: __dirname, resolveName: 'newer-resolver' });
}

export function supportMatrix(scenarios: Scenarios) {
  return scenarios.expand({
    lts,
    release,
    beta,
    canary,
  });
}

export function baseApp() {
  return Project.fromDir(dirname(require.resolve('@ef4/app-template/package.json')), { linkDeps: true });
}
export const appScenarios = supportMatrix(Scenarios.fromProject(baseApp));

export function baseAddon() {
  return Project.fromDir(dirname(require.resolve('@ef4/addon-template/package.json')), { linkDeps: true });
}
export const addonScenarios = supportMatrix(Scenarios.fromProject(baseAddon));
