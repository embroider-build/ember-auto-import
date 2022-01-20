import type Plugin from 'broccoli-plugin';
import type Splitter from './splitter';
import type Package from './package';
import type BundleConfig from './bundle-config';
import type { BundleName } from './bundle-config';
import { buildDebugCallback } from 'broccoli-debug';
import type { TransformOptions } from '@babel/core';
import type webpack from 'webpack';

const debugTree = buildDebugCallback('ember-auto-import');

export interface BundlerOptions {
  consoleWrite: (msg: string) => void;
  environment: 'development' | 'test' | 'production';
  splitter: Splitter;
  packages: Set<Package>;
  appRoot: string;
  bundles: BundleConfig;
  babelConfig: TransformOptions;
  publicAssetURL: string | undefined;
  browserslist: string;
  webpack: typeof webpack;
  hasFastboot: boolean;
}

export interface BuildResult {
  // the keys here include both our well-known BundleName's (which are defined
  // automatically by ember-auto-import) as well as arbitrary string bundle
  // names (because users can also add more entrypoints to the webpack config)
  entrypoints: Map<BundleName | string, string[]>;
  lazyAssets: string[];
}

export type Bundler = Plugin & {
  buildResult: BuildResult;
};

// a Bundler is a broccoli transform node that also has an added property, so to
// wrap it in broccoli-debug we need a little extra work
export function debugBundler(bundler: Bundler, label: string): Bundler {
  let outputTree = debugTree(bundler, label);
  if (outputTree !== bundler) {
    Object.defineProperty(outputTree, 'buildResult', {
      get() {
        return bundler.buildResult;
      },
    });
  }
  return outputTree;
}
