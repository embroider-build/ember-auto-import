import { Scenarios, Project } from 'scenario-tester';
import { dirname, delimiter } from 'path';

// https://github.com/volta-cli/volta/issues/702
// We need this because we're launching node in child processes and we want
// those children to respect volta config per project.
(function restoreVoltaEnvironment() {
  let voltaHome = process.env['VOLTA_HOME'];
  if (!voltaHome) return;
  let paths = process.env['PATH']!.split(delimiter);
  while (/\.volta/.test(paths[0])) {
    paths.shift;
  }
  paths.unshift(`${voltaHome}/bin`);
  process.env['PATH'] = paths.join(delimiter);
})();

async function lts(project: Project) {
  project.linkDevDependency('ember-cli', { baseDir: __dirname, resolveName: 'ember-cli-2.18' });
  project.pkg.volta = {
    node: '10.24.0',
  };
}

async function release(project: Project) {
  project.linkDevDependency('ember-cli', { baseDir: __dirname, resolveName: 'ember-cli-latest' });
}

async function beta(project: Project) {
  project.linkDevDependency('ember-cli', { baseDir: __dirname, resolveName: 'ember-cli-beta' });
}

// canary is not aliased in our package.json, because NPM doesn't support
// aliasing of non-registry deps
async function canary(project: Project) {
  project.linkDevDependency('ember-cli', { baseDir: __dirname, resolveName: 'ember-cli' });
}

export function supportMatrix(scenarios: Scenarios) {
  return scenarios.expand({
    lts,
    release,
    beta,
    canary,
  });
}

export const appScenarios = supportMatrix(
  Scenarios.fromDir(dirname(require.resolve('@ef4/app-template/package.json')))
);

export const addonScenarios = supportMatrix(
  Scenarios.fromDir(dirname(require.resolve('@ef4/addon-template/package.json')))
);
