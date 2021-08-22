declare module 'broccoli-funnel' {
  import Plugin from 'broccoli-plugin';
  import { BroccoliNode } from 'broccoli-node-api';
  export interface Options {
    srcDir?: string;
    destDir?: string;
    allowEmpty?: boolean;
    include?: (string | RegExp | Function)[];
    exclude?: (string | Function)[];
    files?: string[];
    getDestinationPath?: (relativePath: string) => string;
    annotation?: string;
  }
  export class Funnel extends Plugin {
    constructor(inputTree: BroccoliNode, options: Options);
    build(...args: unknown[]): Promise<void>;
    protected srcDir: string;
  }
  export default function (inputTree: BroccoliNode, options: Options): Funnel;
}
