import { module, test } from 'qunit';

module('Unit | deduplication', function(hooks) {

  let sourceCode;

  hooks.before(async function() {
    let vendorURL = [...document.querySelectorAll('script')].find(s => /vendor.*\.js$/.test(s.src)).src;
    let response = await fetch(vendorURL);
    sourceCode = await response.text();
  });

  test('a module imported by both the app and an addon gets deduplicated', async function(assert) {
    assert.equal(sourceCode.match(/ember_auto_import_sample_lib/g).length, 1, "expected only one copy of inner-lib in vendor.js");
  });

  test('a module imported both directly by the app and indirectly by another imported module gets deduplicated', async function(assert) {
    assert.equal(sourceCode.match(/ember_auto_import_inner_lib2_named/g).length, 1, "expected only one copy of inner-lib2/named in vendor.js");
  });
})
