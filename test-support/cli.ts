import yargs from 'yargs';

yargs
  .demandCommand(1, 'Use one of the above commands')
  .command(
    'list',
    'List all the scenarios defined in your test suite',
    yargs =>
      yargs
        .option('files', {
          type: 'string',
          description: 'globs for all your test files',
          demandOption: true,
        })
        .array('files')
        .option('require', {
          type: 'string',
          description: 'module(s) to require before we try to load your tests.',
        })
        .array('require'),
    async argv => {
      let mod = await import('./list');
      await mod.printList(argv);
    }
  )
  .command(
    'output',
    'Write out one of your test scenario apps as a real app on disk, so you can inspect, debug, and run it',
    yargs =>
      yargs
        .option('scenario', {
          type: 'string',
          description: 'Name of scenario. The first scenario to contain this substring will be chosen.',
          demandOption: true,
        })
        .option('outdir', {
          type: 'string',
          description: 'Where to write the app',
          default: 'output',
        })
        .option('files', {
          type: 'string',
          description: 'globs for all your test files',
          demandOption: true,
        })
        .array('files')
        .option('require', {
          type: 'string',
          description: 'module(s) to require before we try to load your tests.',
        })
        .array('require'),
    async argv => {
      let mod = await import('./output');
      await mod.output(argv);
    }
  )
  .help().argv;
