/*
  This module is the only place where we make assumptions about Ember's default
  "app" vs "test" bundles.
*/

import { dirname } from 'path';
const testsPattern = new RegExp(`^(@[^/]+)?/?[^/]+/(tests|test-support)/`);

import type { TreeType } from './analyzer';

function exhausted(label: string, value: never): never {
  throw new Error(`Unknown ${label} specified: ${value}`);
}

export type BundleName = 'app' | 'tests';
export type BundleType = 'js' | 'css';

interface OutputPaths {
  vendor: {
    js: string;
    css: string;
  };
  app: {
    html: string;
  };
}

export default class BundleConfig {
  constructor(private outputPaths: OutputPaths) {}

  // This list of valid bundles, in priority order. The first one in the list that
  // needs a given import will end up with that import.
  get names(): ReadonlyArray<BundleName> {
    return Object.freeze(['app', 'tests']);
  }

  isBuiltInBundleName(name: string): name is BundleName {
    return this.names.includes(name as BundleName);
  }

  get types(): ReadonlyArray<BundleType> {
    return Object.freeze(['js', 'css']);
  }

  // Which final JS file the given bundle's dependencies should go into.
  bundleEntrypoint(name: BundleName, type: BundleType): string {
    switch (name) {
      case 'tests':
        switch (type) {
          case 'js':
            return 'assets/test-support.js';
          case 'css':
            return 'assets/test-support.css';
          default:
            exhausted('test bundle type', type);
        }
      case 'app':
        switch (type) {
          case 'js':
            return this.outputPaths.vendor.js.replace(/^\//, '');
          case 'css':
            return this.outputPaths.vendor.css.replace(/^\//, '');
          default:
            exhausted('app bundle type', type);
        }
      default:
        exhausted('bundle name', name);
    }
  }

  maybeBundleEntrypoint(
    bundleName: string,
    type: BundleType
  ): string | undefined {
    if (this.isBuiltInBundleName(bundleName)) {
      return this.bundleEntrypoint(bundleName, type);
    }
    return undefined;
  }

  bundleNameForEntrypoint(
    entrypoint: string,
    type: BundleType
  ): BundleName | undefined {
    for (let name of this.names) {
      if (entrypoint.endsWith(this.bundleEntrypoint(name, type))) {
        return name;
      }
    }
    return undefined;
  }

  bundleForTreeType(treeType: TreeType): BundleName {
    switch (treeType) {
      case 'app':
      case 'addon':
      case 'addon-templates':
      case 'styles':
      case 'templates':
        return 'app';

      case 'addon-test-support':
      case 'test':
        return 'tests';

      default:
        exhausted('bundle name', treeType);
    }
  }

  // For any relative path to a module in our application, return which bundle its
  // imports go into.
  bundleForPath(path: string): BundleName {
    if (testsPattern.test(path)) {
      return 'tests';
    } else {
      return 'app';
    }
  }

  get lazyChunkPath() {
    return dirname(this.bundleEntrypoint(this.names[0], 'js')!);
  }

  htmlEntrypoints() {
    return [this.outputPaths.app.html, 'tests/index.html'];
  }
}
