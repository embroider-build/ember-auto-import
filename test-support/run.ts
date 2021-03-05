import { exit } from 'process';
import { spawn } from 'child_process';
import prepare from './prepare';
import { dirSync, setGracefulCleanup } from 'tmp';

setGracefulCleanup();

interface RunParams {
  test: string;
  scenarioConfig?: string;
  scenarioName?: string;
  command: string;
}

export async function run(params: RunParams): Promise<{ exitCode: number }> {
  let outdir = dirSync().name;
  await prepare({
    outdir,
    test: params.test,
    scenarioConfig: params.scenarioConfig,
    scenarioName: params.scenarioName,
  });
  let child = spawn(`npm`, ['run', params.command], { stdio: ['inherit', 'inherit', 'inherit'], cwd: outdir });
  return new Promise(resolve => {
    child.on('close', (exitCode: number) => {
      resolve({ exitCode });
    });
  });
}

export default async function runAndExit(params: RunParams) {
  let { exitCode } = await run(params);
  exit(exitCode);
}
