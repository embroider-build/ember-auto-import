declare module 'broccoli-plugin' {

  export interface Tree {}

  export default class Plugin {
    constructor(inputTrees: Tree[], options: any)
    inputPaths: string[];
    outputPath: string
  }

}
