declare module 'broccoli-debug' {
  import { InputNode, Node } from 'broccoli-plugin';
  export default class BroccoliDebug implements Tree {
    constructor(inputTree: InputNode, name: 'string');
    static buildDebugCallback(name: string): (inputTree: InputNode, name: string) => Node;
  }
}
