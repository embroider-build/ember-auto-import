import type Project from 'fixturify-project';
import { removeSync, renameSync } from 'fs-extra';
import { resolve } from 'path';

interface PrepareOptions {
  test: string;
  outdir: string;
  scenarioConfig?: string;
  scenarioName?: string;
}

export default async function prepare(opts: PrepareOptions) {
  let scenarioModule = await import(resolve(opts.test));
  let project = scenarioModule.default as Project;

  if (opts.scenarioName) {
    if (!opts.scenarioConfig) {
      throw new Error(`you must pass scenarioConfig when using scenarioName`);
    }
    let scenarioConfigModule = await import(resolve(opts.scenarioConfig));
    let scenario = scenarioConfigModule[opts.scenarioName];
    if (!scenario) {
      throw new Error(`no scenario named ${opts.scenarioName} in ${opts.scenarioConfig}`);
    }
    project = await scenario(project);
  }

  // fixturify-project always puts your project in a directory whose name is
  // controlled by project.name, under the actual outdir you give it. We don't
  // really want that extra level of indirection, so we emit to a temporary
  // place and move it to where we really wanted it.
  removeSync(`${opts.outdir}--tmp`);
  project.writeSync(`${opts.outdir}--tmp`);
  removeSync(opts.outdir);
  renameSync(`${opts.outdir}--tmp/${project.name}`, opts.outdir);
}
