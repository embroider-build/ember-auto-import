import AutoImport from './auto-import';
import { Tree } from 'broccoli-plugin';

module.exports = {
  name: 'ember-auto-import',

  setupPreprocessorRegistry(type: string, registry: any) {
    // we register on our parent registry (so we will process code
    // from the app or addon that chose to include us) rather than our
    // own registry (which would cause us to process our own code)
    if (type !== 'parent') {
      return;
    }

    // This is where we hook our analyzer into the build pipeline so
    // it will see all the consumer app or addon's javascript
    registry.add('js', {
      name: 'ember-auto-import-analyzer',
      toTree: (tree: Tree) => {
        return AutoImport.lookup(this).analyze(tree, this);
      }
    });
  },

  included() {
    let autoImport = AutoImport.lookup(this);
    this._super.included.apply(this, arguments);
    if (autoImport.isPrimary(this)) {
      autoImport.included(this);
    }
  },

  updateFastBootManifest(manifest: { vendorFiles: string[] }) {
    let autoImport = AutoImport.lookup(this);
    if (autoImport.isPrimary(this)) {
      autoImport.updateFastBootManifest(manifest);
    }
    return manifest;
  }
};
