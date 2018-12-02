declare module 'fs-tree-diff' {
  import { WalkSyncEntry } from 'walk-sync';
  export default class FSTree {
    static fromEntries(input: WalkSyncEntry[]): FSTree;
    calculatePatch(next: FSTree): ([ string, string, WalkSyncEntry ])[]
  }

}
