import Plugin from 'broccoli-plugin';
import { Node } from 'broccoli-node-api';
import { join, extname } from 'path';
import walkSync, { WalkSyncEntry } from 'walk-sync';
import {
  unlinkSync,
  rmdirSync,
  mkdirSync,
  readFileSync,
  existsSync,
  writeFileSync,
  removeSync,
  readdirSync,
} from 'fs-extra';
import FSTree from 'fs-tree-diff';
import symlinkOrCopy from 'symlink-or-copy';
import uniqBy from 'lodash/uniqBy';
import { insertBefore } from './source-map-url';

/*
  This is a fairly specialized broccoli transform that we use to get the output
  of our webpack build added to the ember app. Mostly it's needed because we're
  forced to run quite late and use the postprocessTree hook, rather than nicely
  emit our content as part of treeForVendor, etc, which would be easier but
  doesn't work because of whack data dependencies in new versions of ember-cli's
  broccoli graph.
*/

export interface AppendOptions {
  // map from a directory in the appendedTree (like `entrypoints/app`) to a map
  // keyed by file type (extension) containing file paths that may exists in the
  // upstreamTree (like `assets/vendor.js`). Appends the JS/CSS files in the
  // directory to that file, when it exists.
  mappings: Map<string, Map<string, string>>;

  // map from a directory in the appendedTree (like `lazy`) to a directory where
  // we will output those files in the output (like `assets`).
  passthrough: Map<string, string>;
}

export default class Append extends Plugin {
  private previousUpstreamTree = new FSTree();
  private previousAppendedTree = new FSTree();
  private mappings: Map<string, Map<string, string>>;
  private reverseMappings: Map<string, string>;
  private passthrough: Map<string, string>;

  constructor(upstreamTree: Node, appendedTree: Node, options: AppendOptions) {
    super([upstreamTree, appendedTree], {
      annotation: 'ember-auto-import-analyzer',
      persistentOutput: true,
    });

    // mappings maps entry points to maps that map file types to output files.
    // reverseMappings maps output files back to entry points.
    let reverseMappings = new Map();
    for (let [key, map] of options.mappings.entries()) {
      for (let value of map.values()) {
        reverseMappings.set(value, key);
      }
    }

    this.mappings = options.mappings;
    this.reverseMappings = reverseMappings;
    this.passthrough = options.passthrough;
  }

  private get upstreamDir() {
    return this.inputPaths[0];
  }

  private get appendedDir() {
    return this.inputPaths[1];
  }

  // returns the set of output files that should change based on changes to the
  // appendedTree.
  private diffAppendedTree() {
    let changed: Set<string> = new Set();
    let { patchset, passthroughEntries } = this.appendedPatchset();
    for (let [, relativePath] of patchset) {
      let match = findByPrefix(relativePath, this.mappings);
      if (match) {
        let ext = extname(relativePath).slice(1);
        if (match.mapsTo.has(ext)) {
          changed.add(match.mapsTo.get(ext)!);
        }
      }
    }
    return { needsUpdate: changed, passthroughEntries };
  }

  build() {
    // First note which output files should change due to changes in the
    // appendedTree
    let { needsUpdate, passthroughEntries } = this.diffAppendedTree();

    // Then process all changes in the upstreamTree
    for (let [operation, relativePath, entry] of this.upstreamPatchset(passthroughEntries)) {
      let outputPath = join(this.outputPath, relativePath);
      switch (operation) {
        case 'unlink':
          unlinkSync(outputPath);
          break;
        case 'rmdir':
          rmdirSync(outputPath);
          break;
        case 'mkdir':
          mkdirSync(outputPath);
          break;
        case 'change':
          removeSync(outputPath);
        // deliberate fallthrough
        case 'create':
          if (this.reverseMappings.has(relativePath)) {
            // this is where we see the upstream original file being created or
            // modified. We should always generate the complete appended file here.
            this.handleAppend(relativePath);
            // it no longer needs update once we've handled it here
            needsUpdate.delete(relativePath);
          } else {
            if (isPassthrough(entry)) {
              symlinkOrCopy.sync(join(this.appendedDir, entry.originalRelativePath), outputPath);
            } else {
              symlinkOrCopy.sync(join(this.upstreamDir, relativePath), outputPath);
            }
          }
      }
    }

    // finally, any remaining things in `needsUpdate` are cases where the
    // appendedTree changed but the corresponding file in the upstreamTree
    // didn't. Those needs to get handled here.
    for (let relativePath of needsUpdate.values()) {
      this.handleAppend(relativePath);
    }
  }

  private upstreamPatchset(passthroughEntries: AugmentedWalkSyncEntry[]) {
    let input: AugmentedWalkSyncEntry[] = walkSync.entries(this.upstreamDir).concat(passthroughEntries);

    // FSTree requires the entries to be sorted and uniq
    input.sort(compareByRelativePath);
    input = uniqBy(input, e => (e as any).relativePath);

    let previous = this.previousUpstreamTree;
    let next = (this.previousUpstreamTree = FSTree.fromEntries(input));
    return previous.calculatePatch(next) as [string, string, AugmentedWalkSyncEntry][];
  }

  private appendedPatchset() {
    let input = walkSync.entries(this.appendedDir);
    let passthroughEntries = input
      .map(e => {
        let match = findByPrefix(e.relativePath, this.passthrough);
        if (match) {
          let o = Object.create(e);
          o.relativePath = e.relativePath.replace(new RegExp('^' + match.prefix), match.mapsTo);
          o.isPassthrough = true;
          o.originalRelativePath = e.relativePath;
          return o;
        }
      })
      .filter(e => e && e.relativePath !== './') as AugmentedWalkSyncEntry[];

    let previous = this.previousAppendedTree;
    let next = (this.previousAppendedTree = FSTree.fromEntries(input));
    return { patchset: previous.calculatePatch(next), passthroughEntries };
  }

  private handleAppend(relativePath: string) {
    let upstreamPath = join(this.upstreamDir, relativePath);
    let outputPath = join(this.outputPath, relativePath);
    let ext = extname(relativePath);

    if (!existsSync(upstreamPath)) {
      removeSync(outputPath);
      return;
    }

    let sourceDir = join(this.appendedDir, this.reverseMappings.get(relativePath)!);
    if (!existsSync(sourceDir)) {
      symlinkOrCopy.sync(upstreamPath, outputPath);
      return;
    }

    const separator = ext === '.js' ? ';\n' : '\n';

    let appendedContent = readdirSync(sourceDir)
      .map(name => {
        if (name.endsWith(ext)) {
          return readFileSync(join(sourceDir, name), 'utf8');
        }
      })
      .filter(Boolean)
      .join(separator);
    let upstreamContent = readFileSync(upstreamPath, 'utf8');
    if (appendedContent.length > 0) {
      upstreamContent = insertBefore(upstreamContent, separator + appendedContent);
    }
    writeFileSync(outputPath, upstreamContent, 'utf8');
  }
}

function compareByRelativePath(entryA: WalkSyncEntry, entryB: WalkSyncEntry) {
  let pathA = entryA.relativePath;
  let pathB = entryB.relativePath;

  if (pathA < pathB) {
    return -1;
  } else if (pathA > pathB) {
    return 1;
  }
  return 0;
}

function isPassthrough(entry: AugmentedWalkSyncEntry): entry is PassthroughEntry {
  return (entry as any).isPassthrough;
}

interface PassthroughEntry extends WalkSyncEntry {
  isPassthrough: true;
  originalRelativePath: string;
}

type AugmentedWalkSyncEntry = WalkSyncEntry | PassthroughEntry;

function findByPrefix<T>(path: string, map: Map<string, T>) {
  let parts = path.split('/');
  for (let i = 1; i < parts.length; i++) {
    let candidate = parts.slice(0, i).join('/');
    if (map.has(candidate)) {
      return {
        prefix: candidate,
        mapsTo: map.get(candidate)!,
      };
    }
  }
}
