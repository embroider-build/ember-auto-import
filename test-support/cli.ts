import yargs from 'yargs';

yargs
  .command(
    'prepare',
    'Prepare a test by writing it out as a complete app on disk',
    yargs =>
      yargs
        .option('test', {
          type: 'string',
          description: 'path to test module',
          demandOption: true,
        })
        .option('scenarioConfig', {
          type: 'string',
          description: 'path to optional scenario configuration that can override dependencies in the test',
        })
        .option('scenarioName', {
          type: 'string',
          description: 'name of a scenario in scenarioConfig',
        })
        .option('outdir', {
          type: 'string',
          description: 'output directory',
          default: 'output',
        }),
    async argv => {
      let prepare = await import('./prepare');
      await prepare.default(argv);
    }
  )
  .command(
    'run',
    'Run a test by preparing it and invoking a command',
    yargs =>
      yargs
        .option('test', {
          type: 'string',
          description: 'path to test module',
          demandOption: true,
        })
        .option('command', {
          type: 'string',
          description: 'command to invoke via yarn',
          default: 'test',
        }),
    async argv => {
      let run = await import('./run');
      await run.default(argv);
    }
  )
  .command(
    'list',
    'List all the tests that need to run',
    yargs =>
      yargs
        .option('testsGlob', {
          type: 'string',
          description: 'glob for all your test modules',
          demandOption: true,
        })
        .option('scenarioConfig', {
          type: 'string',
          description: 'path to optional scenario config. Each of your tests will run under every scenario.',
        }),
    async argv => {
      let run = await import('./list');
      await run.default(argv);
    }
  )
  .help().argv;
