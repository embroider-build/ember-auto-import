import { gt, satisfies } from 'semver';
import type AutoImport from './auto-import';
import {
  Project,
  AddonInstance,
  isDeepAddonInstance,
} from '@embroider/shared-internals';
import type { Node } from 'broccoli-node-api';
import makeDebug from 'debug';
const debug = makeDebug('ember-auto-import:leader');

/*
  All versions of ember-auto-import use one of three leader election protocols.

  Versions earlier than 1.8 used __ember_auto_import_protocol_v1__, which was
  superseded because it only allowed one leader per node process, rather than
  one per ember-cli project. We always preempt these versions from actually
  choosing the leader via `v1ProtocolCompat` below.

  Starting at 1.8, versions use __ember_auto_import_protocol_v2__ which can pick
  a leader per project, and which always chooses the newest copy of
  ember-auto-import that's present.

  Starting at 2.0, we don't just choose the newest copy, we choose the newest
  copy that is semver-compatible with the app's requested range of
  ember-auto-import, and:

    - it's mandatory that the app has ember-auto-import
    - ember-auto-import >= 2.0 in an addon requires ember-auto-import >= 2.0 in the app

  This allows addons to take advantage of compatible minor releases of
  ember-auto-import without doing their own semver-breaking releases. These
  versions use '__ember_auto_import_protocol_v3__' amongst themselves, while
  also participating in protocol v2 (which is guaranteed to always choose one of
  them as the leader, since protocol v2 always lets newest win, and all protocol
  v3 versions are newer than all protocol v2 versions).
*/

const protocolV1 = '__ember_auto_import_protocol_v1__';
const protocolV2 = '__ember_auto_import_protocol_v2__';
const protocolV3 = '__ember_auto_import_protocol_v3__';

const g = global as any as {
  [protocolV1]: any;
  [protocolV2]: WeakMap<Project, LeaderChooser> | undefined;
  [protocolV3]: WeakMap<Project, LeaderChooser> | undefined;
};

export class LeaderChooser {
  static for(addon: AddonInstance): LeaderChooser {
    let map: WeakMap<Project, LeaderChooser> | undefined = g[protocolV3];
    if (!map) {
      map = g[protocolV3] = new WeakMap();
    }
    // this needs to be based on project and not app instance because at the
    // early stage where we're doing `register`, the app instance isn't
    // available on the addons yet
    let project = addon.project;
    let chooser = map.get(project);
    if (!chooser) {
      // we are the first v3 copy to run, so we are in charge of the election
      chooser = new this();
      map.set(project, chooser);

      // we need to preempt any subsequent v2 leader choosers and take over any
      // already-started v2 elections. If there's already a v2 leader, it's OK
      // to throw away all the state in it because none of the v2 copies are
      // eligible to win anyway.
      //
      // This does mean that our LeaderChooser's public API needs to remain
      // stable into the future so that v2 copies who see it here will not
      // break.
      let map2 = g[protocolV2];
      if (!map2) {
        map2 = g[protocolV2] = new WeakMap();
      }
      map2.set(project, chooser);
    }
    return chooser;
  }

  private addonCandidates: {
    create: () => AutoImport;
    version: string;
    parentName: string;
  }[] = [];
  private appCandidate:
    | { create: () => AutoImport; version: string; range: string }
    | undefined;
  private locked: AutoImport | undefined;

  register(addon: AddonInstance, create: () => AutoImport) {
    if (this.locked) {
      throw new Error(`bug: LeaderChooser already locked`);
    }
    if (
      !satisfies(addon.pkg.version, '>=2.0.0-alpha.0', {
        includePrerelease: true,
      })
    ) {
      // versions older than 2.0 are not eligible to lead
      return;
    }

    if (isDeepAddonInstance(addon)) {
      this.addonCandidates.push({
        create,
        version: addon.pkg.version,
        parentName: addon.parent.name,
      });
    } else {
      let { dependencies, devDependencies } = addon.project.pkg;
      let range =
        dependencies?.['ember-auto-import'] ??
        devDependencies?.['ember-auto-import'];
      if (!range && addon.project.pkg.name === 'ember-auto-import') {
        range = addon.project.pkg.version;
      }
      if (!range) {
        throw new Error(
          `ember-auto-import cannot find itself in the app's package.json`
        );
      }
      this.appCandidate = { create, version: addon.pkg.version, range };
    }
  }

  get leader(): AutoImport {
    if (!this.locked) {
      if (!this.appCandidate) {
        throw new Error(
          `To use these addons, your app needs ember-auto-import >= 2: ${this.addonCandidates
            .map((c) => c.parentName)
            .sort()
            .join(', ')}`
        );
      }
      let eligible = [this.appCandidate, ...this.addonCandidates].filter((c) =>
        satisfies(c.version, this.appCandidate!.range, {
          includePrerelease: true,
        })
      );
      if (eligible.length === 0) {
        throw new Error(
          `ember-auto-import was unable to find any copy of itself that satisfies the app's requested range of ${this.appCandidate.range}`
        );
      }
      let [candidate, ...rest] = eligible;
      for (let challenger of rest) {
        if (gt(challenger.version, candidate.version)) {
          candidate = challenger;
        }
      }
      this.locked = candidate.create();
      debug(
        'elected %s from %s which satisfies %s',
        candidate.version,
        'parentName' in candidate ? candidate.parentName : 'the app',
        this.appCandidate.range
      );
      let v1 = g[protocolV1];
      if (v1?.isV1Placeholder) {
        v1.leader = this.locked;
      }
    }
    return this.locked;
  }
}

class V1Placeholder {
  isV1Placeholder = true;
  leader: AutoImport | undefined;

  // we never want v1-speaking copies of ember-auto-import to consider
  // themselves primary, so if they're asking here, the answer is no.
  isPrimary() {
    return false;
  }

  // this is the only method that is called after isPrimary returns false. So we
  // need to implement this one and don't need to implement the other public API
  // of AutoImport.
  analyze(tree: Node, addon: AddonInstance) {
    if (!this.leader) {
      throw new Error(
        `bug: expected some protcol v2 copy of ember-auto-import to take charge before any v1 copy started trying to analyze trees`
      );
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
      throw new Error(
        `bug: an old version of ember-auto-import has already taken over. This is unexpected.`
      );
    }
  } else {
    g[protocolV1] = new V1Placeholder();
  }
})();
