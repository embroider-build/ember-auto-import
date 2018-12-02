declare module 'broccoli-debug' {
  import { Tree } from "broccoli-plugin";
  export default class BroccoliDebug implements Tree {
    constructor(inputTree: Tree, name: 'string');
    __broccoliGetInfo__(): any;
  }
  export function buildDebugCallback(name: string): (inputTree: Tree, name: string) => Tree;
}
