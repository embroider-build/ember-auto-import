import { AppInstance } from './ember-cli-models';
import type { TreeType } from './analyzer';
export declare type BundleName = 'app' | 'tests';
export declare type BundleType = 'js' | 'css';
export default class BundleConfig {
    private emberApp;
    constructor(emberApp: AppInstance);
    get names(): ReadonlyArray<BundleName>;
    get types(): ReadonlyArray<BundleType>;
    bundleEntrypoint(name: BundleName, type: BundleType): string | undefined;
    bundleForTreeType(treeType: TreeType): BundleName;
    bundleForPath(path: string): BundleName;
    get lazyChunkPath(): string;
}
