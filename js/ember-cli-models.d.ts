import { Node } from 'broccoli-node-api';
export interface Project {
    targets: unknown;
    ui: {
        write(...args: any[]): void;
    };
    pkg: {
        name: string;
        version: string;
    };
    root: string;
    addons: AddonInstance[];
}
export interface AppInstance {
    env: 'development' | 'test' | 'production';
    project: Project;
    options: any;
    addonPostprocessTree: (which: string, tree: Node) => Node;
}
interface BaseAddonInstance {
    project: Project;
    pkg: {
        name: string;
        version: string;
    };
    root: string;
    options: any;
    addons: AddonInstance[];
    name: string;
}
export interface DeepAddonInstance extends BaseAddonInstance {
    parent: AddonInstance;
}
export interface ShallowAddonInstance extends BaseAddonInstance {
    parent: Project;
    app: AppInstance;
}
export declare type AddonInstance = DeepAddonInstance | ShallowAddonInstance;
export declare function isDeepAddonInstance(addon: AddonInstance): addon is DeepAddonInstance;
export declare function findTopmostAddon(addon: AddonInstance): ShallowAddonInstance;
export {};
