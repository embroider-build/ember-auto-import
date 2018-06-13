import Controller from '@ember/controller';
import innerLib from 'inner-lib';
import innerLib2 from 'inner-lib2';
import innerLib2Named from 'inner-lib2/named';

export default Controller.extend({
  ownInnerLib: innerLib(),
  ownInnerLib2: innerLib2(),
  ownInnerLib2Named: innerLib2Named(),
});
