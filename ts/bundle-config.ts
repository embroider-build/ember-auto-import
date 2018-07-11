/*
  This module is the only place where we make assumptions about Ember's default
  "app" vs "test" bundles.
*/

const testsPattern = new RegExp(`^/?[^/]+/(tests|test-support)/`);

// This list of valid bundles, in priority order. The first one in the list that
// needs a given import will end up with that import.
export const bundles = Object.freeze(['app', 'tests']);

// Options we will pass to app.import when adding the bundle to the application.
export function bundleOptions(name) {
  if (name === 'tests') {
    return { type: 'test' };
  }
  return {};
}

// For any relative path to a module in our application, return which bundle its
// imports go into.
export function bundleForPath(path) {
  if (testsPattern.test(path)) {
    return 'tests';
  } else {
    return 'app';
  }
}
