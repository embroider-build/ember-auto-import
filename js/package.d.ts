import { Configuration } from 'webpack';
import { AddonInstance } from './ember-cli-models';
export declare function reloadDevPackages(): void;
export interface Options {
    exclude?: string[];
    alias?: {
        [fromName: string]: string;
    };
    webpack?: Configuration;
    publicAssetURL?: string;
    forbidEval?: boolean;
    skipBabel?: {
        package: string;
        semverRange?: string;
    }[];
    watchDependencies?: string[];
}
interface DepResolution {
    type: 'package';
    path: string;
    packageName: string;
    packagePath: string;
    local: string;
}
interface LocalResolution {
    type: 'local';
    local: string;
}
interface URLResolution {
    type: 'url';
    url: string;
}
interface ImpreciseResolution {
    type: 'imprecise';
}
export default class Package {
    name: string;
    root: string;
    isAddon: boolean;
    private _options;
    private _parent;
    private _hasBabelDetails;
    private _babelMajorVersion?;
    private _babelOptions;
    private _emberCLIBabelExtensions?;
    private autoImportOptions;
    private isDeveloping;
    private pkgGeneration;
    private pkgCache;
    static lookupParentOf(child: AddonInstance): Package;
    constructor(child: AddonInstance);
    _ensureBabelDetails(): void;
    get babelOptions(): any;
    get babelMajorVersion(): number | undefined;
    get isFastBootEnabled(): boolean;
    private buildBabelOptions;
    private get pkg();
    get namespace(): string;
    private hasDependency;
    private hasNonDevDependency;
    static categorize(importedPath: string, partial?: boolean): "local" | "url" | "imprecise" | "dep";
    resolve(importedPath: string): DepResolution | LocalResolution | URLResolution;
    resolve(importedPath: string, partial: true): DepResolution | LocalResolution | URLResolution | ImpreciseResolution;
    private assertAllowedDependency;
    private excludesDependency;
    get webpackConfig(): any;
    get skipBabel(): Options['skipBabel'];
    private aliasFor;
    get fileExtensions(): string[];
    get publicAssetURL(): string | undefined;
    get forbidsEval(): boolean;
    get watchedDirectories(): string[] | undefined;
}
export {};
