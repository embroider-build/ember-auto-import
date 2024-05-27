import type { InputNode } from 'broccoli-node-api';
import Plugin from 'broccoli-plugin';
import makeDebug from 'debug';
import { existsSync, readFileSync } from 'fs';
import { outputFileSync, readJSONSync } from 'fs-extra';
import { join } from 'path';
import parse5 from 'parse5';
import BundleConfig from './bundle-config';
import { Bundler } from './bundler';

const debug = makeDebug('ember-auto-import:inserter');

export interface InserterOptions {
  publicAssetURL: string;
  insertScriptsAt: string | undefined;
  insertStylesAt: string | undefined;
}

interface Targets {
  // bundle name to scriptChunks
  scripts: Record<string, string[]>;

  // bundle name to styleChunks
  styles: Record<string, string[]>;
}

export class Inserter extends Plugin {
  private outputCache = new Map<string, string>();

  constructor(
    allApp: InputNode,
    private bundler: Bundler,
    private config: BundleConfig,
    private options: InserterOptions
  ) {
    super([allApp], {
      annotation: 'ember-auto-import-inserter',
      persistentOutput: true,
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
          if (asset.endsWith('.js')) {
            fastbootInfo.vendorFiles.push(asset);
          }
        }
      }
      for (let asset of this.bundler.buildResult.lazyAssets) {
        if (asset.endsWith('.js')) {
          fastbootInfo.vendorFiles.push(asset);
        }
      }

      this.cachedOutputFileSync(
        'package.json',
        JSON.stringify(fastbootInfo.pkg, null, 2)
      );
    }
  }

  // not touching our output files helps prevent other parts of the build from
  // reacting to spurious changes. For example, if we touch the HTML, we defeat
  // CSS hot reloading by making ember-cli think the HTML file has changed.
  private cachedOutputFileSync(localFilename: string, content: string) {
    if (this.outputCache.get(localFilename) !== content) {
      this.outputCache.set(localFilename, content);
      outputFileSync(join(this.outputPath, localFilename), content, 'utf8');
    }
  }

  private processHTML(
    filename: string,
    fullName: string,
    fastbootInfo: ReturnType<typeof Inserter.prototype.fastbootManifestInfo>,
    targets: Targets
  ) {
    debug(`parsing %s`, filename);
    let html = readFileSync(fullName, 'utf8');
    let ast = parse5.parse(html, { sourceCodeLocationInfo: true });
    let stringInserter = new StringInserter(html);

    if (this.options.insertScriptsAt) {
      debug(
        `looking for custom script element: %s`,
        this.options.insertScriptsAt
      );
    } else {
      debug(
        `looking for scripts with src: %s`,
        Object.keys(targets.scripts)
          .map((bundleName) =>
            this.config.maybeBundleEntrypoint(bundleName, 'js')
          )
          .filter(Boolean)
      );
    }

    if (this.options.insertStylesAt) {
      debug(
        `looking for custom style element: %s`,
        this.options.insertStylesAt
      );
    } else {
      debug(
        `looking for link with href: %s`,
        Object.keys(targets.styles)
          .map((bundleName) =>
            this.config.maybeBundleEntrypoint(bundleName, 'css')
          )
          .filter(Boolean)
      );
    }

    if (this.includesTests(ast)) {
      targets = useTestTargets(targets);
    }

    let inserted: { kind: 'script' | 'styles'; bundleName: string }[] = [];

    traverse(ast, (element) => {
      if (this.options.insertScriptsAt) {
        if (element.tagName === this.options.insertScriptsAt) {
          let entrypoint = element.attrs.find((a) => a.name === 'entrypoint');
          if (!entrypoint) {
            throw new Error(
              `<${element.tagName}/> element in ${filename} is missing required entrypoint attribute`
            );
          }
          this.replaceCustomScript(
            targets,
            fastbootInfo,
            stringInserter,
            element,
            entrypoint.value,
            inserted
          );
        }
      } else if (element.tagName === 'script') {
        let src = element.attrs.find((a) => a.name === 'src')?.value;
        if (src) {
          debug(`found script with src=%s`, src);
          this.insertScripts(
            targets,
            fastbootInfo,
            stringInserter,
            element,
            src,
            inserted
          );
        }
      }

      if (this.options.insertStylesAt) {
        if (element.tagName === this.options.insertStylesAt) {
          let entrypoint = element.attrs.find((a) => a.name === 'entrypoint');
          if (!entrypoint) {
            throw new Error(
              `<${element.tagName}/> element in ${filename} is missing required entrypoint attribute`
            );
          }
          this.replaceCustomStyle(
            targets,
            stringInserter,
            element,
            entrypoint.value,
            inserted
          );
        }
      } else if (element.tagName === 'link') {
        if (
          element.attrs.some(
            (a) => a.name === 'rel' && a.value === 'stylesheet'
          )
        ) {
          let href = element.attrs.find((a) => a.name === 'href')?.value;
          if (href) {
            debug(`found stylesheet with href=%s`, href);
            this.insertStyles(targets, stringInserter, element, href, inserted);
          }
        }
      }
    });

    if (
      targets.scripts.app &&
      !inserted.find((i) => i.bundleName === 'app' && i.kind === 'script')
    ) {
      if (this.options.insertScriptsAt) {
        throw new Error(
          `ember-auto-import cannot find <${this.options.insertScriptsAt} entrypoint="app"> in ${filename}.`
        );
      } else {
        throw new Error(
          `ember-auto-import could not find a place to insert app scripts in ${filename}.`
        );
      }
    }

    if (
      targets.styles.app &&
      !inserted.find((i) => i.bundleName === 'app' && i.kind === 'styles')
    ) {
      if (this.options.insertStylesAt) {
        throw new Error(
          `ember-auto-import cannot find <${this.options.insertStylesAt} entrypoint="app"> in ${filename}.`
        );
      } else {
        throw new Error(
          `ember-auto-import could not find a place to insert app styles in ${filename}.`
        );
      }
    }

    this.cachedOutputFileSync(filename, stringInserter.serialize());
  }

  private insertScripts(
    targets: Targets,
    fastbootInfo: ReturnType<typeof Inserter.prototype.fastbootManifestInfo>,
    stringInserter: StringInserter,
    element: parse5.Element,
    src: string,
    inserted: { kind: 'script' | 'styles'; bundleName: string }[]
  ) {
    let bundleName = this.config.bundleNameForEntrypoint(src, 'js');
    if (!bundleName) {
      return;
    }
    let scriptChunks = targets.scripts[bundleName];
    if (!scriptChunks) {
      return;
    }
    inserted.push({ bundleName, kind: 'script' });
    debug(`inserting %s`, scriptChunks);
    let insertedSrc = scriptChunks
      .map((chunk) => `\n<script src="${this.chunkURL(chunk)}"></script>`)
      .join('');
    if (fastbootInfo?.readsHTML && bundleName === 'app') {
      // lazy chunks are eager in fastboot because webpack's lazy
      // loading doesn't work in fastboot, because we share a single
      // build with the browser and use a browser-specific
      // lazy-loading implementation. It's probably better to make
      // them eager on the server anyway, so they're handled as part
      // of server startup.
      insertedSrc += this.bundler.buildResult.lazyAssets
        .map(
          (chunk) =>
            `\n<fastboot-script src="${this.chunkURL(
              chunk
            )}"></fastboot-script>`
        )
        .join('');
    }
    stringInserter.insert(element.sourceCodeLocation!.endOffset, insertedSrc);
  }

  private replaceCustomScript(
    targets: Targets,
    fastbootInfo: ReturnType<typeof Inserter.prototype.fastbootManifestInfo>,
    stringInserter: StringInserter,
    element: parse5.Element,
    bundleName: string,
    insertedEntrypoints: { kind: 'script' | 'styles'; bundleName: string }[]
  ) {
    let loc = element.sourceCodeLocation!;
    stringInserter.remove(loc.startOffset, loc.endOffset - loc.startOffset);
    let scriptChunks = targets.scripts[bundleName];
    if (!scriptChunks) {
      return;
    }
    insertedEntrypoints.push({ bundleName, kind: 'script' });
    debug(`inserting %s`, scriptChunks);
    let tags = scriptChunks.map((chunk) =>
      this.scriptFromCustomElement(element, chunk)
    );
    if (fastbootInfo?.readsHTML && bundleName === 'app') {
      // lazy chunks are eager in fastboot because webpack's lazy
      // loading doesn't work in fastboot, because we share a single
      // build with the browser and use a browser-specific
      // lazy-loading implementation. It's probably better to make
      // them eager on the server anyway, so they're handled as part
      // of server startup.
      tags = tags.concat(
        this.bundler.buildResult.lazyAssets.map((chunk) =>
          this.scriptFromCustomElement(element, chunk, 'fastboot-script')
        )
      );
    }
    stringInserter.insert(loc.endOffset, tags.join('\n'));
  }

  private replaceCustomStyle(
    targets: Targets,
    stringInserter: StringInserter,
    element: parse5.Element,
    bundleName: string,
    inserted: { kind: 'script' | 'styles'; bundleName: string }[]
  ) {
    let loc = element.sourceCodeLocation!;
    stringInserter.remove(loc.startOffset, loc.endOffset - loc.startOffset);
    let styleChunks = targets.styles[bundleName];
    if (!styleChunks) {
      return;
    }
    inserted.push({ kind: 'styles', bundleName });
    debug(`inserting %s`, styleChunks);
    let tags = styleChunks.map((chunk) =>
      this.styleFromCustomElement(element, chunk)
    );
    stringInserter.insert(loc.endOffset, tags.join('\n'));
  }

  private scriptFromCustomElement(
    element: parse5.Element,
    chunk: string,
    tag = 'script'
  ) {
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

  private insertStyles(
    targets: Targets,
    stringInserter: StringInserter,
    element: parse5.Element,
    href: string,
    inserted: { kind: 'script' | 'styles'; bundleName: string }[]
  ) {
    let bundleName = this.config.bundleNameForEntrypoint(href, 'css');
    if (!bundleName) {
      return;
    }
    let styleChunks = targets.styles[bundleName];
    if (!styleChunks) {
      return;
    }
    inserted.push({ kind: 'styles', bundleName });
    debug(`inserting %s`, styleChunks);
    stringInserter.insert(
      element.sourceCodeLocation!.endOffset,
      styleChunks
        .map(
          (chunk) => `\n<link rel="stylesheet" href="${this.chunkURL(chunk)}"/>`
        )
        .join('')
    );
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
        throw new Error(
          `bug: ember-auto-import can't find the fastboot manifest vendorFiles`
        );
      }
      return {
        pkg,
        readsHTML: false,
        vendorFiles: pkg.fastboot.manifest.vendorFiles,
      };
    }
  }

  private categorizeChunks(): Targets {
    let targets: Targets = {
      scripts: {},
      styles: {},
    };
    for (let [bundleName, assets] of this.bundler.buildResult.entrypoints) {
      let jsChunks = assets.filter((a) => a.endsWith('.js'));
      if (jsChunks.length > 0) {
        targets.scripts[bundleName] = jsChunks;
      }
      let cssChunks = assets.filter((a) => a.endsWith('.css'));
      if (cssChunks.length > 0) {
        targets.styles[bundleName] = cssChunks;
      }
    }
    return targets;
  }

  private includesTests(ast: parse5.Document): boolean {
    let foundTests = false;
    traverse(ast, (element) => {
      if (this.options.insertScriptsAt) {
        if (element.tagName === this.options.insertScriptsAt) {
          let entrypoint = element.attrs.find((a) => a.name === 'entrypoint');
          if (entrypoint?.value === 'tests') {
            foundTests = true;
          }
        }
      } else {
        if (element.tagName === 'script') {
          let src = element.attrs.find((a) => a.name === 'src')?.value;
          if (
            src &&
            this.config.bundleNameForEntrypoint(src, 'js') === 'tests'
          ) {
            foundTests = true;
          }
        }
      }
    });
    return foundTests;
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
    let mutations = this.mutations
      .slice()
      .sort((a, b) => a.location - b.location);
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

function useTestTargets(targets: Targets): Targets {
  return {
    styles: targets.styles,
    scripts: {
      ...targets.scripts,
      app: targets.scripts.tests,
      tests: [],
    },
  };
}
