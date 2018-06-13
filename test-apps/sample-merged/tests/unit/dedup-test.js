import { module, test } from 'qunit';

module('Unit | deduplication', function() {
  test('only one copy of inner-lib', async function(assert) {
    let vendorURL = [...document.querySelectorAll('script')].find(s => /vendor.*\.js$/.test(s.src)).src;
    let response = await fetch(vendorURL);
    let sourceCode = await response.text();
    assert.equal(sourceCode.match(/ember_auto_import_sample_lib/g).length, 1, "expected only one copy of inner-lib in vendor.js");
  });
})
