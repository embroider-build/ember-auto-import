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

  // Which final JS file the given bundle's dependencies should go into.
  bundleEntrypoint(name: string): string | undefined {
    switch (name) {
      case 'tests':
        return 'assets/test-support.js';
      case 'app':
        return this.emberApp.options.outputPaths.vendor.js.replace(/^\//, '');
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
    return dirname(this.bundleEntrypoint(this.names[0])!);
  }
}
