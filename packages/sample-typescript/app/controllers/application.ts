import Controller from '@ember/controller';
import { computed } from '@ember/object';
import aDependency from 'a-dependency';

export default class extends Controller {
  @computed()
  get result() {
    return aDependency();
  }
}
