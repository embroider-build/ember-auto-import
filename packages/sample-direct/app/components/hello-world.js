import Component from '@ember/component';
import layout from '../templates/components/hello-world';
import moment from 'moment';
import { computed } from '@ember/object';
import innerLib2 from 'my-aliased-module';
import fromScoped from '@ef4/scoped-lib';
import aModuleDependency from 'a-module-dependency';

export default Component.extend({
  layout,

  formattedDate: computed(function () {
    return moment('2018-05-31T18:03:01.791Z').format('YYYY-MM-DD');
  }),

  aliasedResult: computed(function () {
    return innerLib2();
  }),

  fromScoped: computed(function () {
    return fromScoped();
  }),

  moduleDependency: computed(function () {
    return aModuleDependency();
  }),

  // Our test suite imports lodash-es, but our app does not, so it
  // should not be present when we view the app outside the tests.
  lodashPresent: computed(function () {
    try {
      window.require('lodash-es');
      return true;
    } catch (err) {
      return false;
    }
  }),
});
