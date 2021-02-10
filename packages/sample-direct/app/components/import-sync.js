import Component from '@ember/component';
import layout from '../templates/components/import-sync';
import { computed } from '@ember/object';
import { importSync } from '@embroider/macros';

export default Component.extend({
  layout,

  formattedDate: computed(function () {
    const { default: moment } = importSync('moment');
    return moment('2018-05-31T18:03:01.791Z').format('YYYY-MM-DD');
  }),

  aliasedResult: computed(function () {
    const { default: innerLib2 } = importSync('my-aliased-module');
    return innerLib2();
  }),

  prefixAliasedResult: computed(function () {
    const { default: aliasedDeeperNamed } = importSync('my-aliased-module/deeper/named');
    return aliasedDeeperNamed();
  }),

  fromScoped: computed(function () {
    const { default: fromScoped } = importSync('@ef4/scoped-lib');
    return fromScoped();
  }),

  moduleDependency: computed(function () {
    const { default: aModuleDependency } = importSync('a-module-dependency');
    return aModuleDependency();
  }),

  templateDependency: computed('which', function () {
    const { name } = importSync(`another-dependency/flavors/${this.get('which') || 'vanilla'}`);
    return name;
  }),
});
