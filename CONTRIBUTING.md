## Contributing

### Code organization

The actual ember addon is in `./packages/ember-auto-import`. The other packages exist to let us test with many different app scenarios with differing dependencies.

### Installation

- Install [Volta](https://volta.sh/) to ensure you're using matching node and NPM version.
- `git clone <repository-url>`
- `cd ember-auto-import/packages/ember-auto-import`
- `npm install`

### Building

You can build the TypeScript into Javascript with

    npm run compile

If you're making interactive changes, you can leave the compiler watching:

    npm run compile --watch

### Running tests

Our test setup is not typical for an Ember addon. While there is a normal Ember addon dummy app that you can run the normal way (with `ember test`), we also have multiple other apps under `/packages`. This lets us test how ember-auto-import gets integrated under multiple scenarios.

The test apps are all NPM7 workspaces, no need to run separate npm installs for them. They should get symlinked to each other automatically when you install. You can also `cd` directly into any of the test apps and run its tests like a normal Ember app.

The top-level test runner script (`/scripts/test.sh`) probably only works under Unix-like environments, because it relies on GNU parallel to run all the apps at once.

Index of test apps:

- sample-direct: an app that directly uses ember-auto-import
- sample-addon: an addon that uses ember-auto-import to implement a feature that will be used in apps, and also exercises auto-import for devDependencies in its dummy app.
- sample-indirect: an app that uses sample-addon but does not directly depend on ember-auto-import
- sample-failure: an addon that should refuse to build due to importing a devDependency from addon code
