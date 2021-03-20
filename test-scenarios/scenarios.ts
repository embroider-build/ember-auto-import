import { Scenarios, Project } from '@ef4/test-support';
import { dirname } from 'path';

async function beta(project: Project) {
  project.linkDependency('ember-cli', { baseDir: __dirname, resolveName: 'ember-cli-beta' });
}

export const appScenarios = Scenarios.fromDir(dirname(require.resolve('@ef4/app-template/package.json')))
  .add('default', () => {})
  .add('beta', beta);

export const addonScenarios = Scenarios.fromDir(dirname(require.resolve('@ef4/addon-template/package.json')))
  .add('default', () => {})
  .add('beta', beta);
