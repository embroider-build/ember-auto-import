"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeaderChooser = void 0;
const semver_1 = require("semver");
const protocolV1 = '__ember_auto_import_protocol_v1__';
const protocolV2 = '__ember_auto_import_protocol_v2__';
const g = global;
class LeaderChooser {
    static for(addon) {
        let map = g[protocolV2];
        if (!map) {
            map = g[protocolV2] = new WeakMap();
        }
        // this needs to be based on project and not app instance because at the
        // early stage where we're doing `register`, the app instance isn't
        // available on the addons yet
        let project = addon.project;
        let chooser = map.get(project);
        if (!chooser) {
            chooser = new this();
            map.set(project, chooser);
        }
        return chooser;
    }
    register(addon, create) {
        if (this.locked) {
            throw new Error(`bug: LeaderChooser already locked`);
        }
        let version = addon.pkg.version;
        if (!this.tentative || semver_1.gt(version, this.tentative.version)) {
            this.tentative = { create, version };
        }
    }
    get leader() {
        if (!this.locked) {
            if (!this.tentative) {
                throw new Error(`bug: no candidates added`);
            }
            this.locked = this.tentative.create();
            let v1 = g[protocolV1];
            if (v1 === null || v1 === void 0 ? void 0 : v1.isV1Placeholder) {
                v1.leader = this.locked;
            }
        }
        return this.locked;
    }
}
exports.LeaderChooser = LeaderChooser;
class V1Placeholder {
    constructor() {
        this.isV1Placeholder = true;
    }
    // we never want v1-speaking copies of ember-auto-import to consider
    // themselves primary, so if they're asking here, the answer is no.
    isPrimary() {
        return false;
    }
    // this is the only method that is called after isPrimary returns false. So we
    // need to implement this one and don't need to implement the other public API
    // of AutoImport.
    analyze(tree, addon) {
        if (!this.leader) {
            throw new Error(`bug: expected some protcol v2 copy of ember-auto-import to take charge before any v1 copy started trying to analyze trees`);
        }
        return this.leader.analyze(tree, addon);
    }
}
// at module load time, preempt all earlier versions of ember-auto-import that
// don't use our v2 leadership protocol. This ensures that the v2 protocol will
// pick which version is in charge (and v1-speaking copies won't be eligible).
(function v1ProtocolCompat() {
    let v1 = g[protocolV1];
    if (v1) {
        if (!v1.isV1Placeholder) {
            throw new Error(`bug: an old version of ember-auto-import has already taken over. This is unexpected.`);
        }
    }
    else {
        g[protocolV1] = new V1Placeholder();
    }
})();
//# sourceMappingURL=leader.js.map