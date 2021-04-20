import { InputNode } from 'broccoli-node-api';
import Plugin from 'broccoli-plugin';
import makeDebug from 'debug';
import { existsSync, readFileSync } from 'fs';
import { outputFileSync } from 'fs-extra';
import { join } from 'path';
import BundleConfig from './bundle-config';
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
    for (let filename of this.config.htmlEntrypoints()) {
      let fullName = join(this.inputPaths[0], filename);
      if (existsSync(fullName)) {
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
              for (let [url, chunks] of scripts) {
                if (src.endsWith(url)) {
                  debug(`inserting %s`, chunks);
                  let rootURL = src.replace(url, '');
                  stringInserter.insert(
                    element.sourceCodeLocation.endOffset,
                    chunks.map(chunk => `\n<script src="${rootURL}${chunk}"></script>`).join('')
                  );
                }
              }
            }
          }

          if (element.tagName === 'link') {
            if (element.attrs.some(a => a.name === 'rel' && a.value === 'stylesheet')) {
              let href = element.attrs.find(a => a.name === 'href')?.value;
              if (href) {
                debug(`found stylesheet with href=%s`, href);
                for (let [url, chunks] of styles) {
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
    }
  }
}

function chunks(
  buildResult: BuildResult,
  config: BundleConfig
): { scripts: Map<string, string[]>; styles: Map<string, string[]> } {
  let scripts = new Map();
  let styles = new Map();

  for (let [bundleName, assets] of buildResult.entrypoints) {
    let scriptChunks = assets.filter(a => a.endsWith('.js'));
    if (scriptChunks.length > 0) {
      scripts.set(config.bundleEntrypoint(bundleName, 'js'), scriptChunks);
    }
    let styleChunks = assets.filter(a => a.endsWith('.css'));
    if (styleChunks.length > 0) {
      styles.set(config.bundleEntrypoint(bundleName, 'css'), styleChunks);
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
