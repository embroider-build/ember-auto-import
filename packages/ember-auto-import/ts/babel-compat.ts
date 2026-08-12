import type * as Babel from '@babel/core';

// Babel 7 has no bundled types, so these come from @types/babel__core, which
// calls the transform options `TransformOptions`. Babel 8 ships its own types
// and calls them `InputOptions`. Deriving the type from a function signature
// that exists in both avoids having to pick a name.
export type TransformOptions = NonNullable<
  Parameters<typeof Babel.transformSync>[1]
>;
