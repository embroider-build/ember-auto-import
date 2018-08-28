// This pattern won't be needed once it's practical to use components from
// Module Unification addons, because those are accessed from their own
// package's namespace.
export function defineComponents(modulePrefix) {
  // This is a runtime `define` handled by loader.js
  window.define(`${modulePrefix}/components/micro-ember-lib`, function() {
    // This require is processed by webpack.
    /* global require */
    return require('./component');
  });
}
