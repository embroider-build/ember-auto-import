const FastBoot = require('fastboot');
const { execFileSync } = require('child_process');
const { module: Qmodule, test, skip } = require('qunit');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

Qmodule('sample-direct | fastboot', function(hooks) {

  let fastboot;

  hooks.before(async function() {
    execFileSync('node', [require.resolve('ember-cli/bin/ember'), 'build']);
    fastboot = new FastBoot({
      distPath: 'dist',
      resilient: false
    })
  });

  test('no test deps in app', async function(assert) {
    let page = await fastboot.visit('/');
    let html = await page.html();
    let document = new JSDOM(html).window.document;
    assert.equal(document.querySelector('.lodash').textContent.trim(), 'no', 'expected lodash to not be present');
  })

  test('app deps in app', async function(assert) {
    let page = await fastboot.visit('/');
    let html = await page.html();
    let document = new JSDOM(html).window.document;
    assert.equal(document.querySelector('.hello-world').textContent.trim(), '2018-05-31', 'expected moment to work');
  })

  skip('lazy loaded deps', async function(assert) {
    let page = await fastboot.visit('/dynamic-import');
    let html = await page.html();
    let document = new JSDOM(html).window.document;
    assert.equal(document.querySelector('[data-test="dynamic-import-result"]').textContent.trim(), 'ember-auto-import-a-dependency');
  })

});
