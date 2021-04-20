import { InputNode } from 'broccoli-node-api';
import Plugin from 'broccoli-plugin';
import { existsSync, readFileSync } from 'fs';
import { outputFileSync, readJSONSync } from 'fs-extra';
import { join } from 'path';
import { Bundler } from './bundler';

export default class CombineFastbootChunks extends Plugin {
  constructor(private bundler: Bundler, allAppTree: InputNode, private opts: { targetFilename: string }) {
    super([bundler, allAppTree], { annotation: 'ember-auto-import-combine-fastboot-chunks' });
  }

  async build() {
    outputFileSync(
      join(this.outputPath, this.opts.targetFilename),
      this.appendedAssets()
        .map(asset => {
          let fullName = join(this.inputPaths[0], asset);
          return readFileSync(fullName, 'utf8');
        })
        .join('\n'),
      'utf8'
    );
  }

  private appendedAssets(): string[] {
    let { lazyAssets, entrypoints } = this.bundler.buildResult;
    if (this.fastbootReadsHTML()) {
      // we always need to insert the lazy chunks because webpack's lazy loading
      // won't work in fastboot (because we share a single build with the
      // browser, and webpack used a browser-specific lazy loading
      // implementation)
      return lazyAssets;
    } else {
      // on older versions of fastboot, we also need to insert the eager chunks,
      // because fastboot won't notice them in the HTML.
      return entrypoints.get('app')!.concat(lazyAssets);
    }
  }

  // fastboot schema 5 started discovering scripts directly from the HTML.
  // Earlier versions do not.
  private fastbootReadsHTML() {
    let allAppTree = this.inputPaths[1];
    let pkgPath = join(allAppTree, 'package.json');
    if (existsSync(pkgPath)) {
      return (readJSONSync(pkgPath).fastboot?.schemaVersion ?? 0) >= 5;
    }
    return false;
  }
}
