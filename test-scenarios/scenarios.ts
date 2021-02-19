import { join } from 'path';
import { Scenarios, Project } from '@ef4/test-support';

async function beta(project: Project) {
  project.linkDependency('ember-cli', { baseDir: __dirname, resolveName: 'ember-cli-beta' });
}

export const appScenarios = Scenarios.fromDir(join(__dirname, '..', 'app-template'))
  .add('default', () => {})
  .add('beta', beta);

export const addonScenarios = Scenarios.fromDir(join(__dirname, '..', 'addon-template'))
  .add('default', () => {})
  .add('beta', beta);
