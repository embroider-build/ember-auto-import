import Controller from '@ember/controller';
import innerLib from 'inner-lib';

export default Controller.extend({
  ownCopy: innerLib()
});
