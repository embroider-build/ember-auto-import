import { Scenarios, Project } from '@ef4/test-support';
import { dirname } from 'path';

async function beta(project: Project) {
  project.linkDependency('ember-cli', { baseDir: __dirname, resolveName: 'ember-cli-beta' });
}

export function supportMatrix(scenarios: Scenarios) {
  return scenarios.expand({
    default: () => {},
    beta,
  });
}

export const appScenarios = supportMatrix(
  Scenarios.fromDir(dirname(require.resolve('@ef4/app-template/package.json')))
);

export const addonScenarios = supportMatrix(
  Scenarios.fromDir(dirname(require.resolve('@ef4/addon-template/package.json')))
);
