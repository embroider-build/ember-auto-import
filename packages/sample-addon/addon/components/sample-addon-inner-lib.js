import Component from '@ember/component';
import layout from '../templates/components/sample-addon-inner-lib';
import innerLib from 'inner-lib';
import { computed } from '@ember/object';


export default Component.extend({
  layout,
  message: computed(function() {
    return innerLib();
  })
});
