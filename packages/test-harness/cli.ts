import yargs = require('yargs');

yargs
  .command(
    'prepare <base> <scenario>',
    'Prepare a project by combining a base project and a scenario layer',
    yargs => {
      yargs.positional('base', {
        type: 'string',
        description: 'path to base project',
      });
      yargs.positional('scenario', {
        type: 'string',
        description: 'path to scenario layer',
      });
      yargs.option('outdir', {
        type: 'string',
        description: 'output directory',
        default: 'output',
      });
    },
    require('./prepare')
  )
  .help().argv;
