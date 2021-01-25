const { chdir, exit } = require('process');
const { spawn } = require('child_process');

interface RunParams {
  outdir: string;
  base: string;
  scenario: string;
  command: string;
}

module.exports = run;
function run(params: RunParams) {
  const prepare = require('./prepare');
  prepare(params);
  chdir(params.outdir);
  let child = spawn(`yarn`, [params.command], { stdio: ['inherit', 'inherit', 'inherit'] });
  child.on('close', (code: number) => {
    exit(code);
  });
}
