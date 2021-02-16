import Project from 'fixturify-project';
import { join } from 'path';
import merge from 'lodash/merge';

let app = Project.fromDir(join(__dirname, '..', 'app-template'), { linkDeps: true });

merge(app.files, {
  app: {
    templates: {
      'application.hbs': '<h1 data-test="basic">test setup is working</h1>',
    },
  },
  tests: {
    acceptance: {
      'basic-test.js': `
import { module, test } from 'qunit';
import { visit } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';

module('Acceptance | basic', function(hooks) {
  setupApplicationTest(hooks);

  test('visiting /', async function(assert) {
    await visit('/');
    assert.equal(document.querySelector('[data-test="basic"]').textContent.trim(), 'test setup is working');
  });
});
      `,
    },
  },
});

export default app;
