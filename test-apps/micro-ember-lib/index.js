export function defineComponents(modulePrefix) {
  window.define(`${modulePrefix}/components/micro-ember-lib`, function() {
    return require('./component');
  });
}
