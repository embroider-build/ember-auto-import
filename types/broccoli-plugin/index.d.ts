declare module 'broccoli-plugin' {

  export interface Tree {
    __broccoliGetInfo__(): any;
  }

  export interface Options {
    name?: string;
    annotation?: string;
    persistentOutput?: boolean;
    needsCache?: boolean;
  }


  export default abstract class Plugin implements Tree {
    constructor(inputTrees: Tree[], options: Options)
    inputPaths: string[];
    outputPath: string;
    __broccoliGetInfo__(): any;
    abstract build(): Promise<void> | void;
  }

}
