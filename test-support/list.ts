import glob from 'glob';
import { resolve } from 'path';

interface ListOptions {
  testsGlob: string;
  scenarioConfig?: string;
  githubMatrix?: boolean;
}

export async function list(opts: {
  testsGlob: string;
  scenarioConfig?: string;
}): Promise<{ module: string; scenario: string | undefined; command: string; name: string }[]> {
  let modules = glob.sync(opts.testsGlob);

  let scenarios: (undefined | string)[] = [undefined];
  if (opts.scenarioConfig) {
    let scenarioConfigModule = await import(resolve(opts.scenarioConfig));
    scenarios = Object.keys(scenarioConfigModule);
  }

  let result = [];
  for (let module of modules) {
    for (let scenario of scenarios) {
      result.push({ module, scenario, command: commandFor(module, opts, scenario), name: nameFor(module, scenario) });
    }
  }
  return result;
}

export default async function printList(opts: ListOptions) {
  let result = await list(opts);
  if (opts.githubMatrix) {
    let matrix = {
      name: result.map(s => s.name),
      include: result.map(s => ({
        name: s.name,
        command: s.command,
      })),
    };
    process.stdout.write(JSON.stringify(matrix));
  } else {
    process.stdout.write(JSON.stringify(result, null, 2));
  }
}

function commandFor(module: string, opts: ListOptions, scenario: string | undefined): string {
  let cmd = `test-cli run --test ${module}`;
  if (scenario) {
    cmd = `${cmd} --scenarioConfig ${opts.scenarioConfig} --scenario ${scenario}`;
  }
  return cmd;
}

function nameFor(module: string, scenario: string | undefined): string {
  if (scenario) {
    return `${scenario}:${module}`;
  } else {
    return module;
  }
}
