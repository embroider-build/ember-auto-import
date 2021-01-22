# test-harness

This package allows us to have many apps and addons within our test suite, without worrying about keeping them all separately up-to-date.

We combine base projects (like `./app-template`) with specific scenarios (like `./scenarios/noparse`) to generate apps and/or addons on the fly.

## Layering files

Any file in the scenario will overwrite the corresponding path in the base project.

## Combining package.json

`package.json` in the scenario merges (with uniq array append) with the base project's `package.json`.

You can use this to add dependencies, but see "Managing NPM dependencies" below for an additional required step.

## Inserting snippets

Some places in the base project include special comments like:

```js
//TARGET:ember-app-options.snippet
```

If you create a file with a matching name in a scenario, it will be inlined to replace the comment.

## Managing NPM dependencies

We don't run a separate yarn install for each scenario, so all the dependencies that appear in both base projects and scenarios should also be added to this package's `devDependencies`. You can use yarn aliasing to accommodate multiple versions of the same package.

## Nested scenarios

If you specially format a dependency in package.json like:

```js
  "my-addon": "@ef4/test-harness:addon-template:some-scenario"
```

That means we will combine `addon-template` and `some-scenario` to generate the package `my-addon` and make sure it's available in your resulting project.
