import Controller from '@ember/controller';
import { computed } from '@ember-decorators/object';
import aModuleDependency from 'a-module-dependency';

export default class extends Controller {
  @computed()
  get moduleResult() {
    return aModuleDependency();
  }
}
