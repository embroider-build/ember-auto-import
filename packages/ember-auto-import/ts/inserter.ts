import { InputNode } from 'broccoli-node-api';
import Plugin from 'broccoli-plugin';
import makeDebug from 'debug';
import { existsSync, readFileSync } from 'fs';
import { outputFileSync, readJSONSync, writeJSONSync } from 'fs-extra';
import { join } from 'path';
import parse5 from 'parse5';
import BundleConfig, { BundleName } from './bundle-config';
import { BuildResult, Bundler } from './bundler';

const debug = makeDebug('ember-auto-import:inserter');

export class Inserter extends Plugin {
  constructor(allApp: InputNode, private bundler: Bundler, private config: BundleConfig) {
    super([allApp], {
      annotation: 'ember-auto-import-inserter',
    });
  }
  async build() {
    let fastbootInfo = this.fastbootManifestInfo();
    let chunks = categorizeChunks(this.bundler.buildResult, this.config);
    for (let filename of this.config.htmlEntrypoints()) {
      let fullName = join(this.inputPaths[0], filename);
      if (existsSync(fullName)) {
        this.processHTML(filename, fullName, fastbootInfo, chunks);
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
    fastbootInfo: ReturnType<typeof Inserter.prototype.fastbootManifestInfo>,
    chunks: Chunks
  ) {
    debug(`parsing %s`, filename);
    let html = readFileSync(fullName, 'utf8');
    let ast = parse5.parse(html, { sourceCodeLocationInfo: true });
    let stringInserter = new StringInserter(html);

    debug(`looking for scripts: %s`, [...chunks.scripts.keys()]);
    debug(`looking for styles: %s`, [...chunks.styles.keys()]);

    traverse(ast, element => {
      if (element.tagName === 'script') {
        let src = element.attrs.find(a => a.name === 'src')?.value;
        if (src) {
          debug(`found script with src=%s`, src);
          this.insertScripts(chunks, fastbootInfo, stringInserter, element, src);
        }
      }

      if (element.tagName === 'link') {
        if (element.attrs.some(a => a.name === 'rel' && a.value === 'stylesheet')) {
          let href = element.attrs.find(a => a.name === 'href')?.value;
          if (href) {
            debug(`found stylesheet with href=%s`, href);
            this.insertStyles(chunks, stringInserter, element, href);
          }
        }
      }
    });

    let appScripts = [...chunks.scripts.values()].find(entry => entry.bundleName === 'app');
    if (appScripts && !appScripts.inserted) {
      throw new Error(`ember-auto-import could not find a place to insert app scripts in ${filename}.`);
    }

    let appStyles = [...chunks.styles.values()].find(entry => entry.bundleName === 'app');
    if (appStyles && !appStyles.inserted) {
      throw new Error(`ember-auto-import could not find a place to insert app styles in ${filename}.`);
    }

    outputFileSync(join(this.outputPath, filename), stringInserter.serialize(), 'utf8');
  }

  private insertScripts(
    chunks: Chunks,
    fastbootInfo: ReturnType<typeof Inserter.prototype.fastbootManifestInfo>,
    stringInserter: StringInserter,
    element: parse5.Element,
    src: string
  ) {
    for (let [url, entry] of chunks.scripts) {
      if (src.endsWith(url)) {
        let { scriptChunks, bundleName } = entry;
        entry.inserted = true;
        debug(`inserting %s`, scriptChunks);
        let rootURL = src.replace(url, '');
        let insertedSrc = scriptChunks.map(chunk => `\n<script src="${rootURL}${chunk}"></script>`).join('');
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
        stringInserter.insert(element.sourceCodeLocation!.endOffset, insertedSrc);
      }
    }
  }

  private insertStyles(chunks: Chunks, stringInserter: StringInserter, element: parse5.Element, href: string) {
    for (let [url, entry] of chunks.styles) {
      if (href.endsWith(url)) {
        let { styleChunks } = entry;
        entry.inserted = true;
        debug(`inserting %s`, styleChunks);
        let rootURL = href.replace(url, '');
        stringInserter.insert(
          element.sourceCodeLocation!.endOffset,
          styleChunks.map(chunk => `\n<link rel="stylesheet" href="${rootURL}${chunk}"/>`).join('')
        );
      }
    }
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

interface Chunks {
  scripts: Map<string, { scriptChunks: string[]; bundleName: BundleName; inserted: boolean }>;
  styles: Map<string, { styleChunks: string[]; bundleName: BundleName; inserted: boolean }>;
}

function categorizeChunks(buildResult: BuildResult, config: BundleConfig): Chunks {
  let scripts: Chunks['scripts'] = new Map();
  let styles: Chunks['styles'] = new Map();

  for (let [bundleName, assets] of buildResult.entrypoints) {
    let scriptChunks = assets.filter(a => a.endsWith('.js'));
    if (scriptChunks.length > 0) {
      scripts.set(config.bundleEntrypoint(bundleName, 'js'), { scriptChunks, bundleName, inserted: false });
    }
    let styleChunks = assets.filter(a => a.endsWith('.css'));
    if (styleChunks.length > 0) {
      styles.set(config.bundleEntrypoint(bundleName, 'css'), { styleChunks, bundleName, inserted: false });
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

function traverse(node: parse5.ParentNode, fn: (elt: parse5.Element) => void) {
  if ('tagName' in node) {
    fn(node);
  }

  for (let child of node.childNodes) {
    if ('childNodes' in child) {
      traverse(child, fn);
    }
  }
}
