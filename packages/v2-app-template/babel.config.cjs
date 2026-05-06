const { babelCompatSupport, templateCompatSupport } = require('@embroider/compat/babel');

let needsCompiler = require('./package.json')
  .devDependencies['babel-plugin-ember-template-compilation'].split('.')[0]
  .includes('2');

module.exports = {
  plugins: [
    [
      'babel-plugin-ember-template-compilation',
      {
        ...(needsCompiler
          ? {
              compilerPath: 'ember-source/dist/ember-template-compiler.js',
            }
          : {}),
        enableLegacyModules: [
          'ember-cli-htmlbars',
          'ember-cli-htmlbars-inline-precompile',
          'htmlbars-inline-precompile',
        ],
        transforms: [...templateCompatSupport()],
      },
    ],
    [
      'module:decorator-transforms',
      {
        runtime: {
          import: require.resolve('decorator-transforms/runtime-esm'),
        },
      },
    ],
    [
      '@babel/plugin-transform-runtime',
      {
        absoluteRuntime: __dirname,
        useESModules: true,
        regenerator: false,
      },
    ],
    ...babelCompatSupport(),
  ],

  generatorOpts: {
    compact: false,
  },
};
