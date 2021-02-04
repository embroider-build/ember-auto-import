import webpack, { Configuration } from 'webpack';
import { BundleDependencies } from './splitter';
import { BundlerHook, BuildResult } from './bundler';
import BundleConfig from './bundle-config';
import { Options } from './package';
export default class WebpackBundler implements BundlerHook {
    private consoleWrite;
    private publicAssetURL;
    private skipBabel;
    private babelTargets;
    private stagingDir;
    private webpack;
    private outputDir;
    constructor(bundles: BundleConfig, environment: 'production' | 'development' | 'test', extraWebpackConfig: webpack.Configuration | undefined, consoleWrite: (message: string) => void, publicAssetURL: string | undefined, skipBabel: Required<Options>['skipBabel'], babelTargets: unknown, tempArea: string);
    private babelRule;
    build(bundleDeps: Map<string, BundleDependencies>): Promise<BuildResult>;
    private summarizeStats;
    private writeEntryFile;
    private writeLoaderFile;
    private runWebpack;
}
export declare function mergeConfig(dest: Configuration, ...srcs: Configuration[]): any;
