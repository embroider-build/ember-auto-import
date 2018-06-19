
export interface BundlerHookInputs {
  moduleName: string;
  entrypoint: string;
  outputFile: string;
  consoleWrite: (string) => void;
  environment: string;
}
export type BundlerHook = (inputs: BundlerHookInputs, moduleConfig: any) => Promise<void>;