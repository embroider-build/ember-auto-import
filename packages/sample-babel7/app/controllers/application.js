import Controller from '@ember/controller';
import { computed } from '@ember-decorators/object';

export default class extends Controller {
  @computed()
  get result() {
    return 'not yet'; //aDependency();
  }
}
