/*
  This module is the only place where we make assumptions about Ember's default
  "app" vs "test" bundles.
*/

const testsPattern = new RegExp(`^/?[^/]+/(tests|test-support)/`);

export default class BundleConfig {
  constructor(private emberApp) {}

  // This list of valid bundles, in priority order. The first one in the list that
  // needs a given import will end up with that import.
  get names() : ReadonlyArray<string> {
    return Object.freeze(['index.html', 'tests/index.html']);
  }

  // For any relative path to a module in our application, return which bundle its
  // imports go into.
  bundleForPath(path: string): string {
    if (testsPattern.test(path)) {
      return 'tests/index.html';
    } else {
      return 'index.html';
    }
  }

  get lazyChunkPath() {
    return 'assets';
  }
}
