import glob from 'glob';

interface ListOptions {
  testsGlob: string;
  scenarioConfig?: string;
}

export default async function list(opts: ListOptions) {
  let modules = glob.sync(opts.testsGlob);

  let scenarios: (null | string)[] = [null];
  if (opts.scenarioConfig) {
    let scenarioConfigModule = await import(opts.scenarioConfig);
    scenarios = Object.keys(scenarioConfigModule);
  }

  let result = [];
  for (let module of modules) {
    for (let scenario of scenarios) {
      result.push({ module, scenario });
    }
  }

  process.stdout.write(JSON.stringify(result, null, 2));
}
