module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2017,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'prettier', 'ember'],
  extends: ['eslint:recommended', 'plugin:ember/recommended', 'plugin:prettier/recommended'],
  env: {
    browser: true,
  },
  rules: {
    'ember/no-jquery': 'error',
  },
  overrides: [
    // node files
    {
      files: [
        'cli.ts',
        'prepare.ts',
        'run.ts',
        '.eslintrc.js',
        'scenarios/.eslintrc.js',
        'scenarios/.template-lintrc.js',
        'scenarios/ember-cli-build.js',
        'scenarios/testem.js',
        'scenarios/blueprints/*/index.js',
        'scenarios/config/**/*.js',
        'scenarios/lib/*/index.js',
        'scenarios/server/**/*.js',
      ],
      parserOptions: {
        sourceType: 'script',
      },
      env: {
        browser: false,
        node: true,
      },
      plugins: ['node'],
      extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:prettier/recommended'],
      rules: Object.assign({}, require('eslint-plugin-node').configs.recommended.rules, {
        // add your custom rules and overrides for node files here

        // this can be removed once the following is fixed
        // https://github.com/mysticatea/eslint-plugin-node/issues/77
        'node/no-unpublished-require': 'off',
        'node/no-missing-require': 'off',
        'prettier/prettier': 'error',
        'no-var': 'error',
        'prefer-const': 'off',
        'no-fallthrough': 'off', // this doesn't understand typescript's `never`
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-empty-function': 'off',
        '@typescript-eslint/ban-ts-comment': 'off',
        '@typescript-eslint/no-unused-vars': 'error',
        '@typescript-eslint/no-var-requires': 'off',
      }),
    },
  ],
};
