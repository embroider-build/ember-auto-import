# test-harness

This package allows us to have many apps and addons within our test suite, without worrying about keeping them all separately up-to-date.

We combine base projects (like `project-templates/app-template`) with specific scenarios (like `scenarios/noparse`) to generate apps and/or addons on the fly.

## Layering files

Any file in the scenario will overwrite the corresponding path in the base project.

## Combining package.json

`package.json` in the scenario merges (with uniq array append) with the base project's `package.json`.

When we combine the layers we will make sure to symlink packages so they come
from the correct source (base vs scenario).

## Depending on other scenarios

If one of your dependencies resolves to another scenario, we will properly setup
that scenario recursively.

## Inserting snippets

Some places in the base project include special comments like:

```js
//TARGET:ember-app-options.snippet
```

If you create a file with a matching name in a scenario, it will be inlined to replace the comment.
