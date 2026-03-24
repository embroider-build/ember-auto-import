// This is generic because different build systems have different ways of
// representing a found module, and we just pass those values through.
export type Resolution<T = unknown, E = unknown> =
  | {
      type: 'found';
      filename: string;
      result: T;
    }

  // the important thing about this Resolution is that embroider should do its
  // fallback behaviors here.
  | { type: 'not_found'; err: E };

export type RequestAdapterCreate<Init, Res extends Resolution> = (
  params: Init
) =>
  | { initialState: InitialRequestState; adapter: RequestAdapter<Res> }
  | undefined;

export interface RequestAdapter<Res extends Resolution> {
  readonly debugType: string;
  resolve(request: ModuleRequest<Res>): Promise<Res>;

  // the function-returning variants of both of these are only because webpack
  // plugins are a pain in the butt. Integrators are encouraged to use the plain
  // Response-returning variants in all sane build environments.
  notFoundResponse(request: ModuleRequest<Res>): Res | (() => Promise<Res>);
}

export interface InitialRequestState {
  readonly specifier: string;
  readonly fromFile: string;
  readonly meta: Record<string, unknown> | undefined;
}

export class ModuleRequest<Res extends Resolution = Resolution>
  implements ModuleRequest<Res>
{
  static create<Init, Res extends Resolution>(
    createAdapter: RequestAdapterCreate<Init, Res>,
    params: Init
  ): ModuleRequest<Res> | undefined {
    let result = createAdapter(params);
    if (result) {
      return new ModuleRequest(result.adapter, result.initialState);
    }
  }

  #adapter: RequestAdapter<Res>;
  #specifier: string;
  #fromFile: string;
  #meta: Record<string, unknown> | undefined;
  #resolvedTo: Res | (() => Promise<Res>) | undefined;

  private constructor(
    adapter: RequestAdapter<Res>,
    initialize: InitialRequestState
  ) {
    this.#adapter = adapter;
    this.#specifier = initialize.specifier;
    this.#fromFile = initialize.fromFile;
    this.#meta = initialize.meta;
  }

  get specifier(): string {
    return this.#specifier;
  }

  get fromFile(): string {
    return this.#fromFile;
  }

  get debugType(): string {
    return this.#adapter.debugType;
  }

  get meta(): Record<string, unknown> | undefined {
    return this.#meta;
  }

  get resolvedTo(): Res | (() => Promise<Res>) | undefined {
    return this.#resolvedTo;
  }

  alias(newSpecifier: string): this {
    if (this.#specifier === newSpecifier) {
      return this;
    }
    let result = this.clone();
    result.#specifier = newSpecifier;
    return result;
  }

  rehome(newFromFile: string): this {
    if (this.#fromFile === newFromFile) {
      return this;
    }
    let result = this.clone();
    result.#fromFile = newFromFile;
    return result;
  }

  withMeta(meta: Record<string, any> | undefined): this {
    let result = this.clone();
    result.#meta = meta;
    result.#resolvedTo = this.#resolvedTo;
    return result;
  }

  notFound(): this {
    return this.resolveTo(this.#adapter.notFoundResponse(this));
  }

  resolveTo(res: Res | (() => Promise<Res>)): this {
    let result = this.clone();
    result.#resolvedTo = res;
    return result;
  }

  defaultResolve(): Promise<Res> {
    return this.#adapter.resolve(this);
  }

  clone(): this {
    return new ModuleRequest(this.#adapter, this) as this;
  }
}

export async function extractResolution<Res extends Resolution = Resolution>(
  res: Res | (() => Promise<Res>)
): Promise<Res> {
  if (typeof res === 'function') {
    return await res();
  } else {
    return res;
  }
}
