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
  .command(
    'run <base> <scenario> <command>',
    'Prepares a project and then executes the given command in that project',
    yargs => {
      yargs.positional('base', {
        type: 'string',
        description: 'path to base project',
      });
      yargs.positional('scenario', {
        type: 'string',
        description: 'path to scenario layer',
      });
      yargs.positional('command', {
        type: 'string',
        description: 'the name of a command that appears in package.json scripts in the resulting project',
      });
      yargs.option('outdir', {
        type: 'string',
        description: 'output directory',
        default: 'output',
      });
    },
    require('./run')
  )
  .help().argv;
