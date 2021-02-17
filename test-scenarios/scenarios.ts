import merge from 'lodash/merge';
import { defineScenario } from '@ef4/test-support';

defineScenario('fails on purpose', async function (project) {
  merge(project.files, {
    tests: {
      acceptance: {
        'foo-test.js': 'throw new Error("boom")',
      },
    },
  });
});

defineScenario('beta', async function (project) {
  project.linkDependency('ember-cli', { baseDir: __dirname, resolveName: 'ember-cli-beta' });
});
