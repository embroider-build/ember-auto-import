import Controller from '@ember/controller';
import { computed } from '@ember-decorators/object';
import aDependency from 'a-dependency';

export default class extends Controller {
  @computed()
  get result() {
    return aDependency();
  }
}
