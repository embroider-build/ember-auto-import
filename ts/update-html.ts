import Plugin, { Tree } from 'broccoli-plugin';
import { join, dirname, relative } from 'path';
import { ensureDirSync, readFileSync, writeFileSync } from 'fs-extra';
import Bundler from './bundler';
import BundleConfig from './bundle-config';
import { JSDOM } from 'jsdom';

export default class UpdateHTML extends Plugin {
  constructor(upstreamTree: Tree, private bundler: Bundler, private bundleConfig: BundleConfig) {
    super([upstreamTree, bundler], {
      annotation: 'ember-auto-import-update-html',
      persistentOutput: true
    });
  }

  build() {
    for (let file of this.bundleConfig.names) {
      let dom = new JSDOM(readFileSync(join(this.inputPaths[0], file), 'utf8'));
      this.updateHTML(file, dom);
      let outputFile = join(this.outputPath, file);
      ensureDirSync(dirname(outputFile));
      writeFileSync(outputFile, dom.serialize(), 'utf8');
    }
  }

  updateHTML(file, dom) {
    let assets = this.bundler.buildResult.entrypoints.get(file);
    if (!assets) { return; }
    let scripts = [...dom.window.document.querySelectorAll('script')]
    let target = scripts[scripts.length - 1 ];
    for (let asset of assets) {
      let s = dom.window.document.createElement('script');
      s.src = relative(dirname(file), `assets/${asset}`);
      // these newlines make the output more readable
      target.parentElement!.insertBefore(dom.window.document.createTextNode("\n"), target);
      target.parentElement!.insertBefore(s, target);
    }
  }
}
