import { list } from './list';
import { run } from './run';
import { exit } from 'process';

export default async function runall(opts: { testsGlob: string; scenarioConfig: string | undefined; command: string }) {
  let tests = await list(opts);
  let results = new Map<string, boolean>();
  for (let test of tests) {
    process.stdout.write(`=== ${test.name} ===\n`);
    let { exitCode } = await run({
      test: test.module,
      command: opts.command,
      scenarioConfig: opts.scenarioConfig,
      scenarioName: test.scenario,
    });
    results.set(test.name, exitCode === 0);
  }
  process.stdout.write(table([...results.entries()].map(([name, succeeded]) => [name, succeeded ? 'PASS' : 'FAIL'])));
  process.stdout.write('\n');
  let totalExitCode = [...results.values()].every(succeeded => succeeded) ? 0 : 1;
  exit(totalExitCode);
}

function table(rows: string[][], opts = { maxColWidth: 60 }) {
  let columnWidths: number[] = [];
  for (let row of rows) {
    for (let [index, col] of row.entries()) {
      if (columnWidths[index] == null || columnWidths[index] < col.length) {
        columnWidths[index] = Math.min(col.length, opts.maxColWidth);
      }
    }
  }
  return rows.map(row => row.map((col, index) => fit(col, columnWidths[index])).join(' ')).join('\n');
}

function fit(str: string, length: number): string {
  while (str.length < length) {
    str = str + ' ';
  }
  if (str.length > length) {
    str = str.slice(0, length - 3) + '...';
  }
  return str;
}
