import yargs from 'yargs';

yargs
  .command(
    'prepare',
    'Prepare a scenario to run by combining it with its base template and linking all dependencies',
    yargs =>
      yargs
        .option('scenario', {
          type: 'string',
          description: 'name of scenario to prepare',
          demandOption: true,
        })
        .option('outdir', {
          type: 'string',
          description: 'output directory',
          default: 'projects/output',
        }),
    async argv => {
      let prepare = await import('./prepare');
      prepare.default(argv);
    }
  )
  .command(
    'run',
    'Prepares a scenario and then executes the given command in that project',
    yargs =>
      yargs
        .option('scenario', {
          type: 'string',
          description: 'path to scenario layer',
          demandOption: true,
        })
        .option('command', {
          type: 'string',
          description: 'the name of a command that appears in package.json scripts in the resulting project',
          demandOption: true,
        })
        .option('outdir', {
          type: 'string',
          description: 'output directory',
          default: 'projects/output',
        }),
    async argv => {
      let run = await import('./run');
      run.default(argv);
    }
  )
  .help().argv;
