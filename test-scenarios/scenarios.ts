import Project from 'fixturify-project';

export async function defaultScenario(project: Project) {
  return project;
}

export async function emberBeta(project: Project): Promise<Project> {
  project.linkDependency('ember-cli', { baseDir: __dirname, resolveName: 'ember-cli-beta' });
  return project;
}
