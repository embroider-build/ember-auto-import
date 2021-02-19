import { Scenario, seenScenarios } from '.';
import { sync as globSync } from 'glob';
import { resolve } from 'path';

export interface ListParams {
  files: string[];
  require: string[] | undefined;
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
  for (let scenario of await list(params)) {
    process.stdout.write(scenario.name + '\n');
  }
}
