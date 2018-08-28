module.exports = {
  root: true,
  parser: 'babel-eslint',
  parserOptions: {
    ecmaVersion: 2017,
    sourceType: 'module'
  },
  plugins: [
    'ember'
  ],
  extends: [
    'eslint:recommended',
    'plugin:ember/recommended'
  ],
  env: {
    browser: true
  },
  rules: {
    'no-var': 'error'
  },
  overrides: [
    // node files
    {
      files: [
        'ember-cli-build.js',
        'index.js',
        'testem.js',
        'config/**/*.js',
        'tests/dummy/config/**/*.js',
        'lib/**/*.js',
        'fastboot-tests/**/*.js',
        'babel-plugin/**.js'
      ],
      excludedFiles: [
        'addon/**',
        'addon-test-support/**',
        'app/**',
        'tests/dummy/app/**',
        'test-apps/micro-ember-lib/**/*.js'
      ],
      parserOptions: {
        sourceType: 'script',
        ecmaVersion: 2018
      },
      env: {
        browser: false,
        node: true
      },
      plugins: ['node'],
      rules: Object.assign({}, require('eslint-plugin-node').configs.recommended.rules, {
        // add your custom rules and overrides for node files here
        'no-var': 'error'
      })
    }
  ]
};
