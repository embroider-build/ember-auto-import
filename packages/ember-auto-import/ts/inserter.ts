import { InputNode } from 'broccoli-node-api';
import Plugin from 'broccoli-plugin';
import makeDebug from 'debug';
import { existsSync, readFileSync } from 'fs';
import { outputFileSync, readJSONSync, writeJSONSync } from 'fs-extra';
import { join } from 'path';
import parse5 from 'parse5';
import BundleConfig, { BundleName } from './bundle-config';
import { Bundler } from './bundler';

const debug = makeDebug('ember-auto-import:inserter');

export interface InserterOptions {
  publicAssetURL: string;
  insertScriptsAt: string | undefined;
  insertStylesAt: string | undefined;
}

interface Chunks {
  scripts: (
    | {
        // these chunks should be inserted after a script tag whose src ends
        // with targetSrc
        targetSrc: string;
        scriptChunks: string[];
        bundleName: BundleName;
        inserted: boolean;
      }
    | {
        // these chunks should replace the custom element with tagName
        // targetElement
        targetElement: string;
        scriptChunks: string[];
        bundleName: BundleName;
        inserted: boolean;
      }
  )[];

  styles: (
    | {
        // these chunks should be inserted after a link tag whose href ends with
        // targetHref
        targetHref: string;
        styleChunks: string[];
        bundleName: BundleName;
        inserted: boolean;
      }
    | {
        // these chunks should replace the custom element with tagName
        // targetElement
        targetElement: string;
        styleChunks: string[];
        bundleName: BundleName;
        inserted: boolean;
      }
  )[];
}

export class Inserter extends Plugin {
  constructor(
    allApp: InputNode,
    private bundler: Bundler,
    private config: BundleConfig,
    private options: InserterOptions
  ) {
    super([allApp], {
      annotation: 'ember-auto-import-inserter',
    });
  }
  async build() {
    let fastbootInfo = this.fastbootManifestInfo();
    let chunks = this.categorizeChunks();
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

      if (element.tagName === this.options.insertScriptsAt) {
        let entrypoint = element.attrs.find(a => a.name === 'entrypoint');
        if (!entrypoint) {
          throw new Error(`<${element.tagName}/> element in ${filename} is missing required entrypoint attribute`);
        }
        this.replaceCustomScript(chunks, fastbootInfo, stringInserter, element, entrypoint.value);
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

      if (element.tagName === this.options.insertStylesAt) {
        let entrypoint = element.attrs.find(a => a.name === 'entrypoint');
        if (!entrypoint) {
          throw new Error(`<${element.tagName}/> element in ${filename} is missing required entrypoint attribute`);
        }
        this.replaceCustomStyle(chunks, stringInserter, element, entrypoint.value);
      }
    });

    let appScripts = [...chunks.scripts.values()].find(entry => entry.bundleName === 'app');
    if (appScripts && !appScripts.inserted) {
      if ('targetSrc' in appScripts) {
        throw new Error(`ember-auto-import could not find a place to insert app scripts in ${filename}.`);
      } else {
        throw new Error(
          `ember-auto-import cannot find <${appScripts.targetElement} entrypoint="${appScripts.bundleName}"> in ${filename}.`
        );
      }
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
    for (let entry of chunks.scripts) {
      if (!('targetSrc' in entry)) {
        continue;
      }
      if (src.endsWith(entry.targetSrc)) {
        let { scriptChunks, bundleName } = entry;
        entry.inserted = true;
        debug(`inserting %s`, scriptChunks);
        let insertedSrc = scriptChunks.map(chunk => `\n<script src="${this.chunkURL(chunk)}"></script>`).join('');
        if (fastbootInfo?.readsHTML && bundleName === 'app') {
          // lazy chunks are eager in fastboot because webpack's lazy
          // loading doesn't work in fastboot, because we share a single
          // build with the browser and use a browser-specific
          // lazy-loading implementation. It's probably better to make
          // them eager on the server anyway, so they're handled as part
          // of server startup.
          insertedSrc += this.bundler.buildResult.lazyAssets
            .map(chunk => `\n<fastboot-script src="${this.chunkURL(chunk)}"></fastboot-script>`)
            .join('');
        }
        stringInserter.insert(element.sourceCodeLocation!.endOffset, insertedSrc);
      }
    }
  }

  private replaceCustomScript(
    chunks: Chunks,
    fastbootInfo: ReturnType<typeof Inserter.prototype.fastbootManifestInfo>,
    stringInserter: StringInserter,
    element: parse5.Element,
    bundleName: string
  ) {
    let loc = element.sourceCodeLocation!;
    stringInserter.remove(loc.startOffset, loc.endOffset - loc.startOffset);
    for (let entry of chunks.scripts) {
      if (!('targetElement' in entry)) {
        continue;
      }
      if (element.tagName !== entry.targetElement) {
        continue;
      }
      if (bundleName !== entry.bundleName) {
        continue;
      }
      let { scriptChunks } = entry;
      entry.inserted = true;
      debug(`inserting %s`, scriptChunks);
      let tags = scriptChunks.map(chunk => this.scriptFromCustomElement(element, chunk));
      if (fastbootInfo?.readsHTML && bundleName === 'app') {
        // lazy chunks are eager in fastboot because webpack's lazy
        // loading doesn't work in fastboot, because we share a single
        // build with the browser and use a browser-specific
        // lazy-loading implementation. It's probably better to make
        // them eager on the server anyway, so they're handled as part
        // of server startup.
        tags = tags.concat(
          this.bundler.buildResult.lazyAssets.map(chunk =>
            this.scriptFromCustomElement(element, chunk, 'fastboot-script')
          )
        );
      }
      stringInserter.insert(loc.endOffset, tags.join('\n'));
    }
  }

  private replaceCustomStyle(
    chunks: Chunks,
    stringInserter: StringInserter,
    element: parse5.Element,
    bundleName: string
  ) {
    let loc = element.sourceCodeLocation!;
    stringInserter.remove(loc.startOffset, loc.endOffset - loc.startOffset);
    for (let entry of chunks.styles) {
      if (!('targetElement' in entry)) {
        continue;
      }
      if (element.tagName !== entry.targetElement) {
        continue;
      }
      if (bundleName !== entry.bundleName) {
        continue;
      }
      let { styleChunks } = entry;
      entry.inserted = true;
      debug(`inserting %s`, styleChunks);
      let tags = styleChunks.map(chunk => this.styleFromCustomElement(element, chunk));
      stringInserter.insert(loc.endOffset, tags.join('\n'));
    }
  }

  private scriptFromCustomElement(element: parse5.Element, chunk: string, tag = 'script') {
    let output = `<${tag} src="${this.chunkURL(chunk)}"`;
    for (let { name, value } of element.attrs) {
      if (name !== 'entrypoint') {
        output += ` ${name}`;
        if (value) {
          output += `="${value}"`;
        }
      }
    }
    output += `></${tag}>`;
    return output;
  }

  private styleFromCustomElement(element: parse5.Element, chunk: string) {
    let output = `<link rel="stylesheet" href="${this.chunkURL(chunk)}"`;
    for (let { name, value } of element.attrs) {
      if (name !== 'entrypoint') {
        output += ` ${name}`;
        if (value) {
          output += `="${value}"`;
        }
      }
    }
    output += `/>`;
    return output;
  }

  private insertStyles(chunks: Chunks, stringInserter: StringInserter, element: parse5.Element, href: string) {
    for (let entry of chunks.styles) {
      if (!('targetHref' in entry)) {
        continue;
      }
      if (href.endsWith(entry.targetHref)) {
        let { styleChunks } = entry;
        entry.inserted = true;
        debug(`inserting %s`, styleChunks);
        stringInserter.insert(
          element.sourceCodeLocation!.endOffset,
          styleChunks.map(chunk => `\n<link rel="stylesheet" href="${this.chunkURL(chunk)}"/>`).join('')
        );
      }
    }
  }

  private chunkURL(chunk: string) {
    return chunk.replace(/^assets\//, this.options.publicAssetURL);
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

  private categorizeChunks(): Chunks {
    let scripts: Chunks['scripts'] = [];
    let styles: Chunks['styles'] = [];

    for (let [bundleName, assets] of this.bundler.buildResult.entrypoints) {
      let scriptChunks = assets.filter(a => a.endsWith('.js'));
      if (scriptChunks.length > 0) {
        if (this.options.insertScriptsAt) {
          scripts.push({
            scriptChunks,
            bundleName,
            inserted: false,
            targetElement: this.options.insertScriptsAt,
          });
        } else {
          scripts.push({
            scriptChunks,
            bundleName,
            inserted: false,
            targetSrc: this.config.bundleEntrypoint(bundleName, 'js'),
          });
        }
      }
      let styleChunks = assets.filter(a => a.endsWith('.css'));
      if (styleChunks.length > 0) {
        if (this.options.insertStylesAt) {
          styles.push({
            styleChunks,
            bundleName,
            inserted: false,
            targetElement: this.options.insertStylesAt,
          });
        } else {
          styles.push({
            styleChunks,
            bundleName,
            inserted: false,
            targetHref: this.config.bundleEntrypoint(bundleName, 'css'),
          });
        }
      }
    }
    return { scripts, styles };
  }
}

class StringInserter {
  private mutations: (
    | {
        type: 'insert';
        location: number;
        str: string;
      }
    | {
        type: 'remove';
        location: number;
        length: number;
      }
  )[] = [];
  constructor(private original: string) {}
  insert(location: number, str: string) {
    this.mutations.push({ type: 'insert', location, str });
  }
  remove(location: number, length: number) {
    this.mutations.push({ type: 'remove', location, length });
  }
  serialize(): string {
    let output: string[] = [];
    let mutations = this.mutations.slice().sort((a, b) => a.location - b.location);
    let cursor = 0;
    while (mutations.length > 0) {
      let nextMutation = mutations.shift()!;
      output.push(this.original.slice(cursor, nextMutation.location));
      if (nextMutation.type === 'insert') {
        output.push(nextMutation.str);
        cursor = nextMutation.location;
      } else {
        cursor = nextMutation.location + nextMutation.length;
      }
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
