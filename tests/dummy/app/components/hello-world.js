import Component from '@ember/component';
import layout from '../templates/components/hello-world';
import moment from 'moment';
import { computed } from '@ember/object';

export default Component.extend({
  layout,
  formattedDate: computed(function() {
    return moment('2018-05-31T18:03:01.791Z').format('YYYY-MM-DD');
  })
});
