import Controller from '@ember/controller';
import { computed } from '@ember/object';

export default Controller.extend({
  hasLib2: computed(function () {
    try {
      window.require('inner-lib2');
      return true;
    } catch (err) {
      return false;
    }
  }),
});
