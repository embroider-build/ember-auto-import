import Controller from '@ember/controller';
import { computed } from '@ember/object';
import jsDependency from 'a-dependency';
import tsDependency from 'a-pure-ts-dependency';

export default class extends Controller {
  @computed()
  get jsDependency() {
    return jsDependency();
  }

  @computed()
  get tsDependency() {
    return tsDependency();
  }
}
