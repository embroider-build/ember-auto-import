import Plugin from 'broccoli-plugin';
import { Node } from 'broccoli-node-api';
import Splitter, { BundleDependencies } from './splitter';
import Package from './package';
import BundleConfig from './bundle-config';
export interface BundlerPluginOptions {
    consoleWrite: (msg: string) => void;
    environment: 'development' | 'test' | 'production';
    splitter: Splitter;
    packages: Set<Package>;
    bundles: BundleConfig;
    targets: unknown;
}
export interface BuildResult {
    entrypoints: Map<string, string[]>;
    lazyAssets: string[];
    dir: string;
}
export interface BundlerHook {
    build(modules: Map<string, BundleDependencies>): Promise<BuildResult>;
}
export default class Bundler extends Plugin {
    private lastDeps;
    private cachedBundlerHook;
    private didEnsureDirs;
    private options;
    private isWatchingSomeDeps;
    constructor(allAppTree: Node, options: BundlerPluginOptions);
    private get rootPackage();
    private get publicAssetURL();
    private get skipBabel();
    get bundlerHook(): BundlerHook;
    build(): Promise<void>;
    private ensureDirs;
    private addEntrypoints;
    private addLazyAssets;
}
