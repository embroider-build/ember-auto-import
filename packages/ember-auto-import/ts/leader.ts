import { gt } from "semver";
import type AutoImport from "./auto-import";
import { Project, AddonInstance } from './ember-cli-models';

const protocolV1 = "__ember_auto_import_protocol_v1__";
const protocolV2 = "__ember_auto_import_protocol_v2__";
const g = (global as any) as {
  [protocolV1]: any;
  [protocolV2]: WeakMap<Project, LeaderChooser> | undefined;
};

export class LeaderChooser {
  static for(addon: AddonInstance): LeaderChooser {
    let g = global as any;
    let map: WeakMap<Project, LeaderChooser> = g[protocolV2];
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

  private tentative: { create: () => AutoImport; version: string } | undefined;
  private locked: AutoImport | undefined;

  register(addon: AddonInstance, create: () => AutoImport) {
    if (this.locked) {
      throw new Error(`bug: LeaderChooser already locked`);
    }
    let version = addon.pkg.version;
    if (!this.tentative || gt(version, this.tentative.version)) {
      this.tentative = { create, version };
    }
  }

  get leader(): AutoImport {
    if (!this.locked) {
      if (!this.tentative) {
        throw new Error(`bug: no candidates added`);
      }
      this.locked = this.tentative.create();
      let v1 = g[protocolV1];
      if (v1?.isV1Placeholder) {
        g[protocolV1] = this.locked;
      }
    }
    return this.locked;
  }
}

// at module load time, preempt all earlier versions of ember-auto-import that
// don't use our v2 protocol for deciding which copy is in charge. This ensures
// that the v2 protocol will pick which version is in charge (and it can't pick
// a v1-speaking copy).
(function v1ProtocolCompat() {
  let v1 = g[protocolV1];
  if (v1 && !v1.isV1Placeholder) {
    throw new Error(
      `bug: an old version of ember-auto-import has already taken over. This is unexpected.`
    );
  }
  g[protocolV1] = {
    isV1Placeholder: true,
    analyze() {
      throw new Error(
        `bug: expected some copy of ember-auto-import to take charge before anybody started trying to analyze trees`
      );
    },
    isPrimary() {
      return false;
    },
  };
})();
