import Component from '@ember/component';
import layout from '../templates/components/from-sample-addon';
import { capitalize } from 'lodash-es';
import { computed } from '@ember/object';

export default Component.extend({
  layout,
  message: computed(function () {
    return capitalize('hello');
  }),
});
