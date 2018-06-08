import Controller from '@ember/controller';
import { capitalize } from 'lodash-es';
import { computed } from '@ember/object';

export default Controller.extend({
  message: computed(function() {
    return capitalize("hello");
  })
});
