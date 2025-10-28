import { Node } from 'broccoli-node-api';
import { AutoImportSharedAPI } from './auto-import';

/*
  This is designed to fail lazily if you actually try to build with
  ember-auto-import. It's lazy instead of eager because because the build is
  actually running, addons may be attempting to configure ember-auto-import in
  an environment (@embroider/core >= 4.0) where no ember-auto-import is actually
  needed.
*/
export class NullLeader implements AutoImportSharedAPI {
  constructor(private failureMessage: string) {}

  isPrimary(): boolean {
    return false;
  }

  analyze(): Node {
    throw new Error(this.failureMessage);
  }

  included(): void {}

  addTo(): Node {
    throw new Error(this.failureMessage);
  }

  registerV2Addon(): void {}
}
