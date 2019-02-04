window.emberAutoImportNoparsedDependency = function() {

  window.define('this-is-not-a-real-dependency', function() {
    return 'ember-auto-import-noparsed-dependency';
  });

  // this deliberately blows up if we let webpack parse and rewrite this file.
  // It works if webpack ignores our file.
  return require('this-is-not-a-real-dependency');
};
