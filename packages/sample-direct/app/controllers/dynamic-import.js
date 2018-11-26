import Controller from '@ember/controller';
import { computed } from '@ember/object';

export default Controller.extend({
  result: computed(function() {
    return this.model.aDependency();
  })
});
