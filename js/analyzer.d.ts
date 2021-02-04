import { Node } from 'broccoli-node-api';
import Plugin from 'broccoli-plugin';
import type Package from './package';
export declare type TreeType = 'app' | 'addon' | 'addon-templates' | 'addon-test-support' | 'styles' | 'templates' | 'test';
export interface LiteralImport {
    path: string;
    package: Package;
    specifier: string;
    isDynamic: boolean;
    treeType: TreeType | undefined;
}
export interface TemplateImport {
    path: string;
    package: Package;
    cookedQuasis: string[];
    expressionNameHints: (string | undefined)[];
    treeType: TreeType | undefined;
}
export declare type Import = LiteralImport | TemplateImport;
export default class Analyzer extends Plugin {
    private pack;
    private treeType?;
    private previousTree;
    private modules;
    private paths;
    private parse;
    constructor(inputTree: Node, pack: Package, treeType?: "test" | "addon" | "app" | "addon-templates" | "addon-test-support" | "styles" | "templates" | undefined);
    setupParser(): Promise<void>;
    get imports(): Import[];
    build(): Promise<void>;
    private getPatchset;
    private matchesExtension;
    removeImports(relativePath: string): void;
    updateImports(relativePath: string, source: string): void;
    private parseImports;
}
