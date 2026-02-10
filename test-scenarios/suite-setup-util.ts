import execa from 'execa';

async function githubMatrix() {
  let { stdout } = await execa(
    'pnpm',
    [
      'scenario-tester',
      'list',
      '--require',
      'ts-node/register',
      '--files',
      '*-test.ts',
      '--matrix',
      'pnpm run test --filter %s',
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
      // this test fails in windows because of a command imcompatibility with powershell.
      // This is low priority but if someone had the time to look into PRs are welcome 👍
      .filter(s => s.name !== 'release-sample-addon')
      .map(s => ({
        name: `${s.name} windows`,
        os: 'windows',
        command: s.command,
      })),
  ].filter(s => {
    return Boolean(process.env.ENABLE_LEGACY_SCENARIOS) === s.name.startsWith('lts-');
  });

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
