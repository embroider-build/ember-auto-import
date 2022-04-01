import AutoImport from './auto-import';
import type { Node } from 'broccoli-node-api';
import writeFile from 'broccoli-file-creator';
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
      toTree: (
        tree: Node,
        _inputPath: string,
        _outputPath: string,
        options: any
      ) => {
        let treeType;

        if (
          typeof options === 'object' &&
          options !== null &&
          options.treeType
        ) {
          treeType = options.treeType;
        }

        return AutoImport.lookup(this).analyze(tree, this, treeType, true);
      },
    });
  },

  included(...args: unknown[]) {
    this._super.included.apply(this, ...args);
    AutoImport.lookup(this).included(this);
  },

  // this exists to be called by @embroider/addon-shim
  registerV2Addon(packageName: string, packageRoot: string) {
    AutoImport.lookup(this).registerV2Addon(packageName, packageRoot);
  },

  // this only runs on top-level addons, so we don't need our own
  // !isDeepAddonInstance check here.
  postprocessTree(which: string, tree: Node): Node {
    if (which === 'all') {
      return AutoImport.lookup(this).addTo(tree);
    } else {
      return tree;
    }
  },

  treeForAddon() {
    let assetLoaderStub = writeFile(
      'stubs/asset-loader.js',
      `
        export default function stub(RSVP, RETRY_LOAD_SECRET, BundleLoadError) {
          return {
            loadBundle(name, retryLoad) {
              const cachedPromise = this._getFromCache(
                'bundle',
                name,
                retryLoad === RETRY_LOAD_SECRET
              );

              if (cachedPromise) {
                return cachedPromise;
              }

              const bundle = this._getBundle(name);

              const dependencies = bundle.dependencies || [];
              const dependencyPromises = dependencies.map((dependency) =>
                this.loadBundle(dependency, retryLoad)
              );

              const assets = bundle.assets || [];
              const assetPromises = assets.map((asset) =>
                this.loadAsset(asset, retryLoad)
              );

              const bundlePromise = RSVP.allSettled([
                ...dependencyPromises,
                ...assetPromises,
                window.engineLookup[name](),
              ]);
              const bundleWithFail = bundlePromise.then((promises) => {
                const rejects = promises.filter(
                  (promise) => promise.state === 'rejected'
                );
                const errors = rejects.map((reject) => reject.reason);

                if (errors.length) {
                  // Evict rejected promise.
                  this._getFromCache('bundle', name, true);
                  throw new BundleLoadError(this, name, errors);
                }

                return name;
              });

              return this._setInCache('bundle', name, bundleWithFail);
            },
          }
        }
        `
    );

    return this._super.treeForAddon.call(this, assetLoaderStub);
  },
};
