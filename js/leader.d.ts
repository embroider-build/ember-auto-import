import type AutoImport from './auto-import';
import { AddonInstance } from './ember-cli-models';
export declare class LeaderChooser {
    static for(addon: AddonInstance): LeaderChooser;
    private tentative;
    private locked;
    register(addon: AddonInstance, create: () => AutoImport): void;
    get leader(): AutoImport;
}
