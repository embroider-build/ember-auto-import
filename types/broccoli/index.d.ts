declare module 'broccoli' {
  import { Tree } from "broccoli-plugin";
  export class Builder {
    constructor(tree: Tree);
    build(): Promise<void>;
    outputPath: string;
    cleanup(): Promise<void>;
  }
}

