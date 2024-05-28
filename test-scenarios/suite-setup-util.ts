import execa from 'execa';

async function githubMatrix() {
  let { stdout } = await execa(
    'npx',
    [
      'scenario-tester',
      'list',
      '--require',
      'ts-node/register',
      '--files',
      '*-test.ts',
      '--matrix',
      'npm run test -- --filter %s',
    ],
    {
      preferLocal: true,
    }
  );

  let { include: suites } = JSON.parse(stdout) as { include: { name: string; command: string }[]; name: string[] };

  let include = [
    ...suites.map(s => ({
      name: `${s.name} ubuntu`,
      os: 'ubuntu',
      command: s.command,
    })),
    ...suites
      // only run release tests in windows for now as a smoke test and not slow down CI too much
      .filter(s => !['canary', 'beta', 'lts', 'ember3'].some(i => s.name.includes(i)))
      .map(s => ({
        name: `${s.name} windows`,
        os: 'windows',
        command: s.command,
      })),
  ];

  return {
    name: include.map(s => s.name),
    include,
  };
}

async function main() {
  const result = await githubMatrix();

  process.stdout.write(JSON.stringify(result));
}

if (require.main === module) {
  main();
}
