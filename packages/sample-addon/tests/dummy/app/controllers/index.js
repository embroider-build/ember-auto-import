import Controller from '@ember/controller';
import moment from 'moment';

export default Controller.extend({
  message: moment('2018-06-10').format('YYYY'),
});
