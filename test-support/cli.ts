import yargs from 'yargs';

yargs
  .command(
    'prepare',
    'Prepare a test scenario by writing it out as a complete app on disk',
    yargs =>
      yargs
        .option('scenario', {
          type: 'string',
          description: 'path to scenario module',
          demandOption: true,
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
    'Run a test scenario by preparing it and invoking a command',
    yargs =>
      yargs
        .option('scenario', {
          type: 'string',
          description: 'path to scenario module',
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
  .help().argv;
