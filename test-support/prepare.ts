import type Project from 'fixturify-project';
import { removeSync, renameSync } from 'fs-extra';

interface PrepareOptions {
  scenario: string;
  outdir: string;
}

export default async function prepare(opts: PrepareOptions) {
  let scenarioModule = await import(opts.scenario);
  let project = scenarioModule.default as Project;

  // fixturify-project always puts your project in a directory whose name is
  // controlled by project.name, under the actual outdir you give it. We don't
  // really want that extra level of indirection, so we emit to a temporary
  // place and move it to where we really wanted it.
  removeSync(`${opts.outdir}--tmp`);
  project.writeSync(`${opts.outdir}--tmp`);
  removeSync(opts.outdir);
  renameSync(`${opts.outdir}--tmp/${project.name}`, opts.outdir);
}
