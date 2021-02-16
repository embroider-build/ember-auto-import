import type Project from 'fixturify-project';
import { removeSync } from 'fs-extra';

interface PrepareOptions {
  scenario: string;
  outdir: string;
}

export default async function prepare(opts: PrepareOptions) {
  let scenarioModule = await import(opts.scenario);
  let project = scenarioModule.default as Project;
  removeSync(opts.outdir);
  project.writeSync(opts.outdir);
}
