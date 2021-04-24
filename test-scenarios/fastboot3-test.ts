import { baseApp } from './scenarios';
import { PreparedApp, Project, Scenarios } from 'scenario-tester';
import QUnit from 'qunit';
import merge from 'lodash/merge';
import { setupFastboot } from './fastboot-helper';
import { readJSONSync } from 'fs-extra';
import { join } from 'path';

const { module: Qmodule, test } = QUnit;

/*
  This covers our compatibliity with fastboot schemaVersion 5. At the time of
  writing, no version of emer-cli-fastboot actually writes that format (only
  embroider does), but the ember-cli-fastboot 3 beta release we're testing here
  does contain a new-enough version of fastboot that can *read* the new manifest
  format.

  Once there is a released ember-cli-fastboot that writes schemaVersion 5, we
  should drop the hack in this test that writes it manually.
*/
function upgradeFastbootFormat() {
  let upgrader = new Project('fastboot_upgrader', {
    files: {
      'index.js': `
        const Funnel = require('broccoli-funnel');
        const { readJSONSync, writeJSONSync, readFileSync, writeFileSync } = require('fs-extra');
        const { join } = require('path');

        class Upgrader extends Funnel {
          shouldLinkRoots() {
            return false;
          }
          async build() {
            await super.build();
            this.upgradeFastbootFormat();
          }
          upgradeFastbootFormat() {
            let dir = this.outputPath;
            let pkgPath = join(dir, 'package.json');
            let pkg = readJSONSync(pkgPath);

            let fastboot = pkg.fastboot;
            if (fastboot?.schemaVersion !== 3) {
              throw new Error('test expected to find fastboot schemaVersion 3');
            }

            // this is the only thing we expect to appear in the manifest that doesn't
            // already appear in the HTML
            let appFile = fastboot.manifest.appFiles[fastboot.manifest.appFiles.length - 1];

            let htmlPath = join(dir, 'index.html');
            let html = readFileSync(htmlPath, 'utf8');
            writeFileSync(htmlPath, html.replace('</body>', '<script src="/' + appFile + '"></script></body>'), 'utf8');

            pkg.fastboot = {
              schemaVersion: 5,
              htmlEntrypoint: 'index.html',
              moduleWhitelist: [],
            };

            writeJSONSync(pkgPath, pkg);
          }
        }

        module.exports = {
          name: 'fastboot_upgrader',
          postprocessTree(which, tree) {
            if (which === 'all') {
              tree = new Upgrader(tree);
            }
            return tree;
          }
        }
    `,
    },
  });

  upgrader.linkDependency('fs-extra', { baseDir: __dirname });
  upgrader.linkDependency('broccoli-funnel', { baseDir: __dirname });

  merge(upgrader.pkg, {
    keywords: ['ember-addon'],
    'ember-addon': {
      before: ['ember-auto-import'],
    },
  });

  return upgrader;
}

Scenarios.fromProject(baseApp)
  .map('fastboot3', project => {
    project.linkDependency('ember-auto-import', { baseDir: __dirname });
    project.linkDependency('webpack', { baseDir: __dirname });
    project.linkDependency('ember-cli-fastboot', { baseDir: __dirname, resolveName: 'ember-cli-fastboot3' });
    project.addDevDependency(upgradeFastbootFormat());

    merge(project.files, {
      'ember-cli-build.js': `
        const EmberApp = require('ember-cli/lib/broccoli/ember-app');
        module.exports = function (defaults) {
          let app = new EmberApp(defaults, {
            babel: {
              plugins: [
                require('ember-auto-import/babel-plugin')
              ],
            },
          });
          return app.toTree();
        };
      `,
      app: {
        templates: {
          'application.hbs': `<div data-test="a">{{this.model.a}}</div><div data-test="b">{{this.model.b}}</div>`,
        },
        routes: {
          'application.js': `
            import Route from '@ember/routing/route';
            import a from 'a';
            export default Route.extend({
              model() {
                return import('b').then(module => {
                  return { a: a(), b: module.default() };
                });
              },
            });
          `,
        },
      },
    });

    project.addDevDependency('a', {
      files: {
        'index.js': `
          module.exports = function() {
            return 'ember-auto-import-a';
          }`,
      },
    });

    project.addDevDependency('b', {
      files: {
        'index.js': `
          module.exports = function() {
            return 'ember-auto-import-b';
          }`,
      },
    });
  })
  .expand({
    dev: () => {},
    prod: () => {},
  })
  .forEachScenario(scenario => {
    Qmodule(scenario.name, function (hooks) {
      let app: PreparedApp;
      let visit: any;
      hooks.before(async () => {
        app = await scenario.prepare();
        ({ visit } = await setupFastboot(app));
      });

      test('it works', async function (assert) {
        let document = (await visit('/')).window.document;
        assert.equal(document.querySelector('[data-test="a"]').textContent.trim(), 'ember-auto-import-a');
        assert.equal(document.querySelector('[data-test="b"]').textContent.trim(), 'ember-auto-import-b');
      });

      // this is just to confirm that our fastboot_upgrader worked, it can be
      // dropped if we can drop fastboot_upgrader
      test('it is using schema version 5', async function (assert) {
        assert.equal(readJSONSync(join(app.dir, 'dist', 'package.json')).fastboot?.schemaVersion, 5);
      });
    });
  });
