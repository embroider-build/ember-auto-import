declare module 'broccoli-funnel' {
  import { InputNode } from 'broccoli-node-api';
  import Plugin from 'broccoli-plugin';
  export default class Funnel extends Plugin {
    constructor(
      input: InputNode,
      opts?: {
        destDir?: string;
      }
    );
  }
}
