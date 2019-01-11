/*
  This module is the only place where we make assumptions about Ember's default
  "app" vs "test" bundles.
*/

import { dirname } from 'path';
import makeDebug from 'debug';

const debug = makeDebug('ember-auto-import:splitter');
const testsPattern = new RegExp(`^/?[^/]+/(tests|test-support)/`);

export default class BundleConfig {
  constructor(private emberApp: any) {}

  // This is the list of valid bundles.
  get names() : ReadonlyArray<string> {
    return Object.freeze(['app', 'tests']);
  }

  // given a bundle name, which other bundles does it depend on?
  dependencies(bundleName: string): string[] {
    switch (bundleName) {
      case 'tests':
        return ['app'];
      default:
        return [];
    }
  }

  // Which final JS file the given bundle's dependencies should go into.
  bundleEntrypoint(name: string): string {
    switch (name) {
      case 'tests':
        return 'assets/test-support.js';
      case 'app':
        return this.emberApp.options.outputPaths.vendor.js.replace(/^\//, '');
      default:
        throw new Error(`${name} is not a known bundle name`);
    }
  }

  get lazyChunkPath() {
    return dirname(this.bundleEntrypoint(this.names[0]));
  }

  // given that a module is imported by the given list of paths, which
  // bundles should it go in?
  chooseBundles(paths: string[]): string[] {
    let usedInBundles: Set<string> = new Set();
    paths.forEach(path => {
      usedInBundles.add(this.bundleForPath(path));
    });
    return [this.names.find(bundle => usedInBundles.has(bundle))!];
  }

  private bundleForPath(path: string) {
    let bundleName: string;
    if (testsPattern.test(path)) {
      bundleName = 'tests';
    } else {
      bundleName = 'app';
    }
    debug('bundleForPath("%s")=%s', path, bundleName);
    return bundleName;
  }
}
