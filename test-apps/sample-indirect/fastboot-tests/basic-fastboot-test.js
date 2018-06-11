const FastBoot = require('fastboot');
const { execFileSync } = require('child_process');
const { module: Qmodule, test } = require('qunit');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

Qmodule('sample-indirect | fastboot', function(hooks) {

  let fastboot;

  hooks.before(async function() {
    execFileSync('node', [require.resolve('ember-cli/bin/ember'), 'build']);
    fastboot = new FastBoot({
      distPath: 'dist',
      resilient: false
    })
  });

  test('index', async function(assert) {
    let page = await fastboot.visit('/');
    let html = await page.html();
    let document = new JSDOM(html).window.document;
    assert.equal(document.querySelector('[data-test="from-sample-addon"]').textContent.trim(), 'Hello', 'lodash-es is working');
  }),


  test('no test-support deps in app', async function(assert) {
    let page = await fastboot.visit('/dep-check');
    let html = await page.html();
    let document = new JSDOM(html).window.document;
    assert.equal(document.querySelector('[data-test="lib2-status"]').textContent.trim(), 'no', 'expected inner-lib2 to not be present');
  })


});
