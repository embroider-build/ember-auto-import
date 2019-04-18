/*
  This module is the only place where we make assumptions about Ember's default
  "app" vs "test" bundles.
*/

import { dirname } from 'path';
const testsPattern = new RegExp(`^/?[^/]+/(tests|test-support)/`);

export default class BundleConfig {
  constructor(private emberApp: any) {}

  // This list of valid bundles, in priority order. The first one in the list that
  // needs a given import will end up with that import.
  get names() : ReadonlyArray<string> {
    return Object.freeze(['app', 'tests']);
  }

  get types(): ReadonlyArray<string> {
    return Object.freeze(['js', 'css']);
  }

  // Which final JS file the given bundle's dependencies should go into.
  bundleEntrypoint(name: string, type: string): string | undefined {
    switch (name) {
      case 'tests':
        switch (type) {
          case 'js':
            return 'assets/test-support.js';
          case 'css':
            return 'assets/test-support.css';
        }
      case 'app':
        switch (type) {
          case 'js':
            return this.emberApp.options.outputPaths.vendor.js.replace(/^\//, '');
          case 'css':
            return this.emberApp.options.outputPaths.vendor.css.replace(/^\//, '');
        }
    }
  }

  // For any relative path to a module in our application, return which bundle its
  // imports go into.
  bundleForPath(path: string): string {
    if (testsPattern.test(path)) {
      return 'tests';
    } else {
      return 'app';
    }
  }

  get lazyChunkPath() {
    return dirname(this.bundleEntrypoint(this.names[0], 'js')!);
  }
}
