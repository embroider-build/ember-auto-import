"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const broccoli_plugin_1 = __importDefault(require("broccoli-plugin"));
const path_1 = require("path");
const walk_sync_1 = __importDefault(require("walk-sync"));
const fs_extra_1 = require("fs-extra");
const fs_tree_diff_1 = __importDefault(require("fs-tree-diff"));
const symlink_or_copy_1 = __importDefault(require("symlink-or-copy"));
const uniqBy_1 = __importDefault(require("lodash/uniqBy"));
const source_map_url_1 = require("./source-map-url");
class Append extends broccoli_plugin_1.default {
    constructor(upstreamTree, appendedTree, options) {
        super([upstreamTree, appendedTree], {
            annotation: 'ember-auto-import-analyzer',
            persistentOutput: true,
        });
        this.previousUpstreamTree = new fs_tree_diff_1.default();
        this.previousAppendedTree = new fs_tree_diff_1.default();
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
    get upstreamDir() {
        return this.inputPaths[0];
    }
    get appendedDir() {
        return this.inputPaths[1];
    }
    // returns the set of output files that should change based on changes to the
    // appendedTree.
    diffAppendedTree() {
        let changed = new Set();
        let { patchset, passthroughEntries } = this.appendedPatchset();
        for (let [, relativePath] of patchset) {
            let match = findByPrefix(relativePath, this.mappings);
            if (match) {
                let ext = path_1.extname(relativePath).slice(1);
                if (match.mapsTo.has(ext)) {
                    changed.add(match.mapsTo.get(ext));
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
            let outputPath = path_1.join(this.outputPath, relativePath);
            switch (operation) {
                case 'unlink':
                    fs_extra_1.unlinkSync(outputPath);
                    break;
                case 'rmdir':
                    fs_extra_1.rmdirSync(outputPath);
                    break;
                case 'mkdir':
                    fs_extra_1.mkdirSync(outputPath);
                    break;
                case 'change':
                    fs_extra_1.removeSync(outputPath);
                // deliberate fallthrough
                case 'create':
                    if (this.reverseMappings.has(relativePath)) {
                        // this is where we see the upstream original file being created or
                        // modified. We should always generate the complete appended file here.
                        this.handleAppend(relativePath);
                        // it no longer needs update once we've handled it here
                        needsUpdate.delete(relativePath);
                    }
                    else {
                        if (isPassthrough(entry)) {
                            symlink_or_copy_1.default.sync(path_1.join(this.appendedDir, entry.originalRelativePath), outputPath);
                        }
                        else {
                            symlink_or_copy_1.default.sync(path_1.join(this.upstreamDir, relativePath), outputPath);
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
    upstreamPatchset(passthroughEntries) {
        let input = walk_sync_1.default.entries(this.upstreamDir).concat(passthroughEntries);
        // FSTree requires the entries to be sorted and uniq
        input.sort(compareByRelativePath);
        input = uniqBy_1.default(input, e => e.relativePath);
        let previous = this.previousUpstreamTree;
        let next = (this.previousUpstreamTree = fs_tree_diff_1.default.fromEntries(input));
        return previous.calculatePatch(next);
    }
    appendedPatchset() {
        let input = walk_sync_1.default.entries(this.appendedDir);
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
            .filter(e => e && e.relativePath !== './');
        let previous = this.previousAppendedTree;
        let next = (this.previousAppendedTree = fs_tree_diff_1.default.fromEntries(input));
        return { patchset: previous.calculatePatch(next), passthroughEntries };
    }
    handleAppend(relativePath) {
        let upstreamPath = path_1.join(this.upstreamDir, relativePath);
        let outputPath = path_1.join(this.outputPath, relativePath);
        let ext = path_1.extname(relativePath);
        if (!fs_extra_1.existsSync(upstreamPath)) {
            fs_extra_1.removeSync(outputPath);
            return;
        }
        let sourceDir = path_1.join(this.appendedDir, this.reverseMappings.get(relativePath));
        if (!fs_extra_1.existsSync(sourceDir)) {
            symlink_or_copy_1.default.sync(upstreamPath, outputPath);
            return;
        }
        const separator = ext === '.js' ? ';\n' : '\n';
        let appendedContent = fs_extra_1.readdirSync(sourceDir)
            .map(name => {
            if (name.endsWith(ext)) {
                return fs_extra_1.readFileSync(path_1.join(sourceDir, name), 'utf8');
            }
        })
            .filter(Boolean)
            .join(separator);
        let upstreamContent = fs_extra_1.readFileSync(upstreamPath, 'utf8');
        if (appendedContent.length > 0) {
            upstreamContent = source_map_url_1.insertBefore(upstreamContent, separator + appendedContent);
        }
        fs_extra_1.writeFileSync(outputPath, upstreamContent, 'utf8');
    }
}
exports.default = Append;
function compareByRelativePath(entryA, entryB) {
    let pathA = entryA.relativePath;
    let pathB = entryB.relativePath;
    if (pathA < pathB) {
        return -1;
    }
    else if (pathA > pathB) {
        return 1;
    }
    return 0;
}
function isPassthrough(entry) {
    return entry.isPassthrough;
}
function findByPrefix(path, map) {
    let parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
        let candidate = parts.slice(0, i).join('/');
        if (map.has(candidate)) {
            return {
                prefix: candidate,
                mapsTo: map.get(candidate),
            };
        }
    }
}
//# sourceMappingURL=broccoli-append.js.map