"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findTopmostAddon = exports.isDeepAddonInstance = void 0;
function isDeepAddonInstance(addon) {
    return addon.parent !== addon.project;
}
exports.isDeepAddonInstance = isDeepAddonInstance;
function findTopmostAddon(addon) {
    if (isDeepAddonInstance(addon)) {
        return findTopmostAddon(addon.parent);
    }
    else {
        return addon;
    }
}
exports.findTopmostAddon = findTopmostAddon;
//# sourceMappingURL=ember-cli-models.js.map