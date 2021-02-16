import { chdir, exit } from 'process';
import { spawn } from 'child_process';
import prepare from './prepare';
import { dirSync, setGracefulCleanup } from 'tmp';

setGracefulCleanup();

interface RunParams {
  test: string;
  command: string;
}

export default async function run(params: RunParams) {
  let outdir = dirSync().name;
  await prepare({
    outdir,
    test: params.test,
  });
  chdir(outdir);
  let child = spawn(`yarn`, [params.command], { stdio: ['inherit', 'inherit', 'inherit'] });
  child.on('close', (code: number) => {
    exit(code);
  });
}
