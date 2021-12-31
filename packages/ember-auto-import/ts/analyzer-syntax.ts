import { ReadStream } from 'fs';

export interface LiteralImportSyntax {
  isDynamic: boolean;
  specifier: string;
}

export interface TemplateImportSyntax {
  isDynamic: boolean;
  // these are the string parts of the template literal. The first one always
  // comes before the first expression.
  cookedQuasis: string[];
  // for each of the expressions in between the cookedQuasis, this is an
  // optional hint for what to name the expression that goes there. It's
  // optional because in general there may not be an obvious name, but in
  // practice there often is, and we can aid debuggability by using names that
  // match the original code.
  expressionNameHints: (string | null)[];
}

export type ImportSyntax = LiteralImportSyntax | TemplateImportSyntax;

// this should change if we ever change the implementation of the
// serialize/deserialize below, so that babel caches will be invalidated.
//
// this needs to have enough entropy that is it unlikely to collide with
// anything that appears earlier than it in the JS modules.
export const MARKER = 'eaimeta@70e063a35619d71f';

export function serialize(imports: ImportSyntax[]): string {
  let tokens = [];
  for (let imp of imports) {
    if ('specifier' in imp) {
      tokens.push(imp.isDynamic ? 1 : 0);
      tokens.push(imp.specifier);
    } else {
      tokens.push(imp.isDynamic ? 3 : 2);
      tokens.push(imp.cookedQuasis);
      tokens.push(imp.expressionNameHints);
    }
  }
  return `${MARKER}${JSON.stringify(tokens).slice(1, -1)}${MARKER}`;
}

export function deserialize(source: ReadStream): Promise<ImportSyntax[]> {
  let deserializer = new Deserializer(source);
  return deserializer.output;
}

class Deserializer {
  private state:
    | {
        // we're looking for the start marker
        type: 'finding-start';
      }
    | {
        type: 'start-partial-match';
        // how many codepoints of the marker were present at the end of the
        // previous chunk (to handle a marker that splits across chunks)
        partialMatch: number;
      }
    | {
        // we're looking for the end marker
        type: 'finding-end';
        // the meta we've read so far
        meta: string[];
      }
    | {
        type: 'end-partial-match';
        // the meta we've read so far
        meta: string[];
        // how many codepoints of the marker were present at the end of the
        // previous chunk (to handle a marker that splits across chunks)
        partialMatch: number;
      }
    | {
        type: 'done-reading';
        meta: string;
      }
    | {
        type: 'finished';
      } = {
    type: 'finding-start',
  };

  output: Promise<ImportSyntax[]>;
  private resolve: (result: ImportSyntax[]) => void;
  private reject: (err: any) => void;

  constructor(private source: ReadStream) {
    let r: (result: ImportSyntax[]) => void, e: (err: any) => void;
    this.output = new Promise<ImportSyntax[]>((resolve, reject) => {
      r = resolve;
      e = reject;
    });
    this.resolve = r!;
    this.reject = e!;
    source.on('readable', this.run.bind(this));
    source.on('error', this.reject);
    source.on('close', this.finish.bind(this));
  }

  // keeps consuming chunks until we read null (meaning no buffered data
  // available) or the state machine decides to stop
  private run() {
    let chunk: string | null;
    // setting the read size bigger than the marker length is important. We can
    // deal with a marker split between two chunks, but not three or more.
    while (null !== (chunk = this.source.read(1024))) {
      this.consumeChunk(chunk);
      if (this.state.type === 'done-reading') {
        this.finish();
        break;
      }
    }
  }

  private consumeChunk(chunk: string): void {
    let { state } = this;
    switch (state.type) {
      case 'finding-start':
        {
          let start = chunk.indexOf(MARKER);
          if (start >= 0) {
            // found the start, enter finding-end state
            this.state = {
              type: 'finding-end',
              meta: [],
            };
            // pass the rest of the chunk forward to the next state
            return this.consumeChunk(chunk.slice(start + MARKER.length));
          }
          let partialMatch = matchesAtEnd(chunk, MARKER);
          if (partialMatch > 0) {
            this.state = {
              type: 'start-partial-match',
              partialMatch,
            };
          }
        }
        break;
      case 'start-partial-match':
        if (chunk.startsWith(MARKER.slice(state.partialMatch))) {
          // completed partial match, go into finding-end state
          this.state = {
            type: 'finding-end',
            meta: [],
          };
          return this.consumeChunk(
            chunk.slice(MARKER.length - state.partialMatch)
          );
        } else {
          // partial match failed to complete
          this.state = {
            type: 'finding-start',
          };
          return this.consumeChunk(chunk);
        }
      case 'finding-end': {
        let endIndex = chunk.indexOf(MARKER);
        if (endIndex >= 0) {
          // found the end
          this.state = {
            type: 'done-reading',
            meta: [...state.meta, chunk.slice(0, endIndex)].join(''),
          };
        } else {
          let partialMatch = matchesAtEnd(chunk, MARKER);
          if (partialMatch > 0) {
            this.state = {
              type: 'end-partial-match',
              meta: [...state.meta, chunk.slice(0, -partialMatch)],
              partialMatch,
            };
          } else {
            state.meta.push(chunk);
          }
        }
        break;
      }
      case 'end-partial-match':
        if (chunk.startsWith(MARKER.slice(state.partialMatch))) {
          // completed partial match, go into finding-end state
          this.state = {
            type: 'done-reading',
            meta: state.meta.join(''),
          };
        } else {
          // partial match failed to complete, so we need to replace the partial
          // marker match we stripped off the last chunk
          this.state = {
            type: 'finding-end',
            meta: [...state.meta, MARKER.slice(0, state.partialMatch)],
          };
          return this.consumeChunk(chunk);
        }
        break;
      case 'done-reading':
      case 'finished':
        throw new Error(`bug: tried to consume more chunks when already done`);
      default:
        throw assertNever(state);
    }
  }

  private convertTokens(meta: string) {
    let tokens = JSON.parse('[' + meta + ']');
    let syntax: ImportSyntax[] = [];
    while (tokens.length > 0) {
      let type = tokens.shift();
      switch (type) {
        case 0:
          syntax.push({
            isDynamic: false,
            specifier: tokens.shift(),
          });
          break;
        case 1:
          syntax.push({
            isDynamic: true,
            specifier: tokens.shift(),
          });
          break;
        case 2:
          syntax.push({
            isDynamic: false,
            cookedQuasis: tokens.shift(),
            expressionNameHints: tokens.shift(),
          });
          break;
        case 3:
          syntax.push({
            isDynamic: true,
            cookedQuasis: tokens.shift(),
            expressionNameHints: tokens.shift(),
          });
          break;
      }
    }
    return syntax;
  }

  private finish() {
    if (this.state.type === 'finished') {
      return;
    }
    let syntax: ImportSyntax[];
    if (this.state.type === 'done-reading') {
      syntax = this.convertTokens(this.state.meta);
    } else {
      syntax = [];
    }
    this.state = { type: 'finished' };
    this.resolve(syntax);
    this.source.destroy();
  }
}

function assertNever(value: never) {
  throw new Error(`bug: never should happen ${value}`);
}

function matchesAtEnd(chunk: string, marker: string): number {
  while (marker.length > 0) {
    if (chunk.endsWith(marker)) {
      return marker.length;
    }
    marker = marker.slice(0, -1);
  }
  return 0;
}
