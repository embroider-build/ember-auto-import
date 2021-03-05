import { join } from 'path';
import { Scenarios, Project } from '@ef4/test-support';
import { dirname } from 'path';

async function beta(project: Project) {
  project.linkDependency('ember-cli', { baseDir: __dirname, resolveName: 'ember-cli-beta' });
}

export const appScenarios = Scenarios.fromDir(dirname(require.resolve('@ef4/app-template/package.json')))
  .add('default', () => {})
  .add('beta', beta);

// TODO this path doesn't exist yet, create a real package analogous to @ef4/app-template
export const addonScenarios = Scenarios.fromDir(join(__dirname, '..', 'addon-template'))
  .add('default', () => {})
  .add('beta', beta);
