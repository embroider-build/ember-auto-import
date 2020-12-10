declare module 'broccoli' {
  import { InputNode } from "broccoli-node-api";
  export class Builder {
    constructor(tree: InputNode);
    build(): Promise<void>;
    outputPath: string;
    cleanup(): Promise<void>;
  }
}

