import AutoImport from './auto-import';
import { Node } from 'broccoli-node-api';
// @ts-ignore
import pkg from '../package';

module.exports = {
  name: pkg.name,

  init(...args: any[]) {
    this._super.init.apply(this, args);
    AutoImport.register(this);
  },

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
      toTree: (tree: Node, _inputPath: string, _outputPath: string, options: any) => {
        let treeType;

        if (typeof options === 'object' && options !== null && options.treeType) {
          treeType = options.treeType;
        }

        return AutoImport.lookup(this).analyze(tree, this, treeType);
      },
    });
  },

  included(...args: unknown[]) {
    let autoImport = AutoImport.lookup(this);
    this._super.included.apply(this, ...args);
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
  },
};
