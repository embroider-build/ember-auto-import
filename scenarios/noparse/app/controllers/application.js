import Controller from '@ember/controller';
import { computed } from '@ember-decorators/object';

// sets window.emberAutoImportNoparsedDependency
import 'noparsed-dependency';

export default class extends Controller {
  @computed()
  get result() {
    return window.emberAutoImportNoparsedDependency();
  }
}
