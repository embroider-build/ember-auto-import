import { chdir, exit } from 'process';
import { spawn } from 'child_process';
import prepare from './prepare';

interface RunParams {
  outdir: string;
  scenario: string;
  command: string;
}

export default function run(params: RunParams) {
  prepare(params);
  chdir(params.outdir);
  let child = spawn(`yarn`, [params.command], { stdio: ['inherit', 'inherit', 'inherit'] });
  child.on('close', (code: number) => {
    exit(code);
  });
}
