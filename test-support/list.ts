import { Scenario, seenScenarios } from '.';
import { sync as globSync } from 'glob';
import { resolve } from 'path';

export interface ListParams {
  files: string[];
  require: string[] | undefined;
  matrix: boolean;
}

export async function list(params: ListParams): Promise<Scenario[]> {
  if (params.require) {
    for (let r of params.require) {
      require(resolve(r));
    }
  }
  for (let pattern of params.files) {
    for (let file of globSync(pattern)) {
      require(resolve(file));
    }
  }
  return seenScenarios;
}

export async function printList(params: ListParams) {
  let scenarios = await list(params);
  if (params.matrix) {
    process.stdout.write(
      JSON.stringify({
        include: scenarios.map(scenario => ({
          name: scenario.name,
          command: `npm run test --filter "${scenario.name}:"`,
          dir: 'test-scenarios',
        })),
        name: scenarios.map(scenario => scenario.name),
      })
    );
  } else {
    for (let scenario of scenarios) {
      process.stdout.write(scenario.name + '\n');
    }
  }
}
