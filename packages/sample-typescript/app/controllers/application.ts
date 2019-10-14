import Controller from '@ember/controller';
import { computed } from '@ember/object';
import jsDependency from 'a-dependency';
import tsDependency from 'a-pure-ts-dependency';
import precedenceDependency from 'a-pure-ts-dependency/js-takes-precedence';

export default class extends Controller {
  @computed()
  get jsDependency() {
    return jsDependency();
  }

  @computed()
  get tsDependency() {
    return tsDependency();
  }

  @computed()
  get precedenceDependency() {
    return precedenceDependency();
  }
}
