import Analyzer from './analyzer';
import type { TreeType } from './analyzer';
import Append from './broccoli-append';
import { Node } from 'broccoli-node-api';
import { AddonInstance } from './ember-cli-models';
export interface AutoImportSharedAPI {
    isPrimary(addonInstance: AddonInstance): boolean;
    analyze(tree: Node, addon: AddonInstance, treeType?: TreeType): Node;
    included(addonInstance: AddonInstance): void;
    updateFastBootManifest(manifest: {
        vendorFiles: string[];
    }): void;
}
export default class AutoImport implements AutoImportSharedAPI {
    private primaryPackage;
    private packages;
    private env;
    private consoleWrite;
    private analyzers;
    private bundles;
    private targets;
    static register(addon: AddonInstance): void;
    static lookup(addon: AddonInstance): AutoImportSharedAPI;
    constructor(addonInstance: AddonInstance);
    isPrimary(addon: AddonInstance): boolean;
    analyze(tree: Node, addon: AddonInstance, treeType?: TreeType): Analyzer;
    private makeBundler;
    addTo(allAppTree: Node): Append;
    included(addonInstance: AddonInstance): void;
    private configureFingerprints;
    updateFastBootManifest(manifest: {
        vendorFiles: string[];
    }): void;
}
