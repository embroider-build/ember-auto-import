declare module 'broccoli-source' {
  import { Tree } from 'broccoli-plugin';

  export class WatchedDir implements Tree {
    __broccoliGetInfo__(): any;
    constructor(inputDir: string);
  }

  export class UnwatchedDir implements Tree {
    __broccoliGetInfo__(): any;
    constructor(inputDir: string);
  }

}
