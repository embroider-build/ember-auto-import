import { dirname } from 'path';
import type { Compiler, Module, ResolveData } from 'webpack';
import { ModuleRequest, RequestAdapter, Resolution } from './module-request';

export class AutoImportResolverPlugin {
  async #resolve(
    request: ModuleRequest<WebpackResolution>
  ): Promise<WebpackResolution> {
    console.log(
      `TODO: intrecepting request ${request.specifier} from ${request.fromFile}`
    );
    return await request.defaultResolve();
  }

  apply(compiler: Compiler) {
    compiler.hooks.normalModuleFactory.tap('ember-auto-import', (nmf) => {
      let defaultResolve = getDefaultResolveHook(nmf.hooks.resolve.taps);

      nmf.hooks.resolve.tapAsync(
        { name: 'ember-auto-import', stage: 50 },
        (state: ExtendedResolveData, callback: CB) => {
          let request = ModuleRequest.create(WebpackRequestAdapter.create, {
            resolveFunction: defaultResolve,
            state,
          });
          if (!request) {
            defaultResolve(state, callback);
            return;
          }

          this.#resolve(request).then(
            (resolution) => {
              switch (resolution.type) {
                case 'not_found':
                  callback(resolution.err as any);
                  break;
                case 'found':
                  callback(null, undefined);
                  break;
                default:
                  throw assertNever(resolution);
              }
            },
            (err) => callback(err)
          );
        }
      );
    });
  }
}

interface CB {
  (err: null, result: Module | undefined): void;
  (err: Error | null): void;
}
type DefaultResolve = (state: ResolveData, callback: CB) => void;

// Despite being absolutely riddled with way-too-powerful tap points,
// webpack still doesn't succeed in making it possible to provide a
// fallback to the default resolve hook in the NormalModuleFactory. So
// instead we will find the default behavior and call it from our own tap,
// giving us a chance to handle its failures.
function getDefaultResolveHook(
  // eslint-disable-next-line @typescript-eslint/ban-types
  taps: { name: string; fn: Function }[]
): DefaultResolve {
  let { fn } = taps.find((t) => t.name === 'NormalModuleFactory')!;
  return fn as DefaultResolve;
}

type ExtendedResolveData = ResolveData & {
  contextInfo: ResolveData['contextInfo'] & {
    _embroiderMeta?: Record<string, any>;
  };
};

type WebpackResolution = Resolution<ResolveData['createData'], null | Error>;

class WebpackRequestAdapter implements RequestAdapter<WebpackResolution> {
  static create({
    resolveFunction,
    state,
  }: {
    resolveFunction: DefaultResolve;
    state: ExtendedResolveData;
  }) {
    let specifier = state.request;
    if (
      specifier.startsWith('!') // ignores internal webpack resolvers
    ) {
      return;
    }

    let fromFile: string | undefined;
    if (state.contextInfo.issuer) {
      fromFile = state.contextInfo.issuer;
    }
    if (!fromFile) {
      return;
    }

    return {
      initialState: {
        specifier,
        fromFile,
        meta: state.contextInfo._embroiderMeta,
      },
      adapter: new WebpackRequestAdapter(resolveFunction, state),
    };
  }

  private constructor(
    private resolveFunction: DefaultResolve,
    private originalState: ExtendedResolveData
  ) {}

  get debugType() {
    return 'webpack';
  }

  // Webpack mostly relies on mutation to adjust requests. We could create a
  // whole new ResolveData instead, and that would allow defaultResolving to
  // happen, but for the output of that process to actually affect the
  // downstream code in Webpack we would still need to mutate the original
  // ResolveData with the results (primarily the `createData`). So since we
  // cannot avoid the mutation anyway, it seems best to do it earlier rather
  // than later, so that everything from here forward is "normal".
  //
  // Technically a NormalModuleLoader `resolve` hook *can* directly return a
  // Module, but that is not how the stock one works, and it would force us to
  // copy more of Webpack's default behaviors into the inside of our hook. Like,
  // we would need to invoke afterResolve, createModule, createModuleClass, etc,
  // just like webpack does if we wanted to produce a Module directly.
  //
  // So the mutation strategy is much less intrusive, even though it means there
  // is the risk of state leakage all over the place.
  //
  // We mitigate that risk by waiting until the last possible moment to apply
  // our desired ModuleRequest fields to the ResolveData. This means that as
  // requests evolve through the module-resolver they aren't actually all
  // mutating the shared state. Only when a request is allowed to bubble back
  // out to webpack does that happen.
  toWebpackResolveData(
    request: ModuleRequest<WebpackResolution>
  ): ExtendedResolveData {
    let specifier = request.specifier;
    this.originalState.request = specifier;
    this.originalState.context = dirname(request.fromFile);
    this.originalState.contextInfo.issuer = request.fromFile;
    this.originalState.contextInfo._embroiderMeta = request.meta;
    if (request.resolvedTo && typeof request.resolvedTo !== 'function') {
      if (request.resolvedTo.type === 'found') {
        this.originalState.createData = request.resolvedTo.result;
      }
    }
    return this.originalState;
  }

  notFoundResponse(
    request: ModuleRequest<WebpackResolution>
  ): WebpackResolution {
    let err = new Error(`module not found ${request.specifier}`);
    (err as any).code = 'MODULE_NOT_FOUND';
    return { type: 'not_found', err };
  }

  async resolve(
    request: ModuleRequest<WebpackResolution>
  ): Promise<WebpackResolution> {
    return this._resolve(request);
  }

  async _resolve(
    request: ModuleRequest<WebpackResolution>
  ): Promise<WebpackResolution> {
    return await new Promise((resolve) =>
      this.resolveFunction(this.toWebpackResolveData(request), (err) => {
        if (err) {
          // unfortunately webpack doesn't let us distinguish between Not Found
          // and other unexpected exceptions here.
          resolve({ type: 'not_found', err });
        } else {
          resolve({
            type: 'found',
            result: this.originalState.createData,
            filename: this.originalState.createData.resource!,
          });
        }
      })
    );
  }
}

function assertNever(_value: never) {
  throw new Error(`not supposed to get here`);
}
