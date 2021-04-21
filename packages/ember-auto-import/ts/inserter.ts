import { InputNode } from 'broccoli-node-api';
import Plugin from 'broccoli-plugin';
import makeDebug from 'debug';
import { existsSync, readFileSync } from 'fs';
import { outputFileSync, readJSONSync, writeJSONSync } from 'fs-extra';
import { join } from 'path';
import BundleConfig, { BundleName } from './bundle-config';
import { BuildResult, Bundler } from './bundler';
import { parse, traverse } from './parse-html';

const debug = makeDebug('ember-auto-import:inserter');

export class Inserter extends Plugin {
  constructor(allApp: InputNode, private bundler: Bundler, private config: BundleConfig) {
    super([allApp], {
      annotation: 'ember-auto-import-inserter',
    });
  }
  async build() {
    let fastbootInfo = this.fastbootManifestInfo();
    for (let filename of this.config.htmlEntrypoints()) {
      let fullName = join(this.inputPaths[0], filename);
      if (existsSync(fullName)) {
        this.processHTML(filename, fullName, fastbootInfo);
      }
    }

    if (fastbootInfo && !fastbootInfo.readsHTML) {
      // we need to add our chunks to the fastboot manifest, because this
      // version of fastboot doesn't look for scripts in HTML.
      let assets = this.bundler.buildResult.entrypoints.get('app');
      if (assets) {
        for (let asset of assets) {
          fastbootInfo.vendorFiles.push(asset);
        }
      }
      for (let asset of this.bundler.buildResult.lazyAssets) {
        fastbootInfo.vendorFiles.push(asset);
      }
      writeJSONSync(join(this.outputPath, 'package.json'), fastbootInfo.pkg);
    }
  }

  private processHTML(
    filename: string,
    fullName: string,
    fastbootInfo: ReturnType<typeof Inserter.prototype.fastbootManifestInfo>
  ) {
    debug(`parsing %s`, filename);
    let html = readFileSync(fullName, 'utf8');
    let ast = parse(html);
    let { scripts, styles } = chunks(this.bundler.buildResult, this.config);
    let stringInserter = new StringInserter(html);

    debug(`looking for scripts: %s`, [...scripts.keys()]);
    debug(`looking for styles: %s`, [...styles.keys()]);

    traverse(ast, element => {
      if (element.tagName === 'script') {
        let src = element.attrs.find(a => a.name === 'src')?.value;
        if (src) {
          debug(`found script with src=%s`, src);
          for (let [url, { chunks, bundleName }] of scripts) {
            if (src.endsWith(url)) {
              debug(`inserting %s`, chunks);
              let rootURL = src.replace(url, '');
              let insertedSrc = chunks.map(chunk => `\n<script src="${rootURL}${chunk}"></script>`).join('');
              if (fastbootInfo?.readsHTML && bundleName === 'app') {
                // lazy chunks are eager in fastboot because webpack's lazy
                // loading doesn't work in fastboot, because we share a single
                // build with the browser and use a browser-specific
                // lazy-loading implementation. It's probably better to make
                // them eager on the server anyway, so they're handled as part
                // of server startup.
                insertedSrc += this.bundler.buildResult.lazyAssets
                  .map(chunk => `\n<fastboot-script src="${rootURL}${chunk}"></fastboot-script>`)
                  .join('');
              }
              stringInserter.insert(element.sourceCodeLocation.endOffset, insertedSrc);
            }
          }
        }
      }

      if (element.tagName === 'link') {
        if (element.attrs.some(a => a.name === 'rel' && a.value === 'stylesheet')) {
          let href = element.attrs.find(a => a.name === 'href')?.value;
          if (href) {
            debug(`found stylesheet with href=%s`, href);
            for (let [url, { chunks }] of styles) {
              if (href.endsWith(url)) {
                debug(`inserting %s`, chunks);
                let rootURL = href.replace(url, '');
                stringInserter.insert(
                  element.sourceCodeLocation.endOffset,
                  chunks.map(chunk => `\n<link rel="stylesheet" href="${rootURL}${chunk}"/>`).join('')
                );
              }
            }
          }
        }
      }
    });
    outputFileSync(join(this.outputPath, filename), stringInserter.serialize(), 'utf8');
  }

  private fastbootManifestInfo():
    | { readsHTML: true }
    | { readsHTML: false; pkg: any; vendorFiles: string[] }
    | undefined {
    let pkgPath = join(this.inputPaths[0], 'package.json');
    if (!existsSync(pkgPath)) {
      return undefined;
    }
    let pkg = readJSONSync(pkgPath);
    if (!pkg.fastboot) {
      return undefined;
    }
    if ((pkg.fastboot.schemaVersion ?? 0) >= 5) {
      // starting in schemaVersion 5, fastboot discovers scripts directly from
      // the HTML, so we don't need to muck about with inserting things into a
      // separate manifest
      return { readsHTML: true };
    } else {
      if (!pkg.fastboot.manifest?.vendorFiles) {
        throw new Error(`bug: ember-auto-import can't find the fastboot manifest vendorFiles`);
      }
      return { pkg, readsHTML: false, vendorFiles: pkg.fastboot.manifest.vendorFiles };
    }
  }
}

function chunks(buildResult: BuildResult, config: BundleConfig) {
  let scripts: Map<string, { chunks: string[]; bundleName: BundleName }> = new Map();
  let styles: Map<string, { chunks: string[]; bundleName: BundleName }> = new Map();

  for (let [bundleName, assets] of buildResult.entrypoints) {
    let scriptChunks = assets.filter(a => a.endsWith('.js'));
    if (scriptChunks.length > 0) {
      scripts.set(config.bundleEntrypoint(bundleName, 'js'), { chunks: scriptChunks, bundleName });
    }
    let styleChunks = assets.filter(a => a.endsWith('.css'));
    if (styleChunks.length > 0) {
      styles.set(config.bundleEntrypoint(bundleName, 'css'), { chunks: styleChunks, bundleName });
    }
  }
  return { scripts, styles };
}

class StringInserter {
  private insertions: { location: number; str: string }[] = [];
  constructor(private original: string) {}
  insert(location: number, str: string) {
    this.insertions.push({ location, str });
  }
  serialize(): string {
    let output: string[] = [];
    let insertions = this.insertions.slice().sort((a, b) => a.location - b.location);
    let cursor = 0;
    while (insertions.length > 0) {
      let nextInsertion = insertions.shift()!;
      output.push(this.original.slice(cursor, nextInsertion.location));
      output.push(nextInsertion.str);
      cursor = nextInsertion.location;
    }
    output.push(this.original.slice(cursor));
    return output.join('');
  }
}
