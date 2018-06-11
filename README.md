ember-auto-import
==============================================================================

Just `import` from NPM, with zero configuration.

Installation
------------------------------------------------------------------------------

```
ember install ember-auto-import
```


Usage
------------------------------------------------------------------------------

Add whatever dependency you want to your project using NPM or yarn like:

```
npm install --save-dev lodash-es
```

or

```
yarn add --dev lodash-es
```

Then just import it from your Ember app code:

```
import { capitalize } from 'lodash-es';
```

There is no step two. Works from both app code and test code.

Customizing
------------------------------------------------------------------------------

While most NPM packages authored in CommonJS or ES Modules will Just Work,
for others you may need some give ember-auto-import a hint on what to
do.

You can set options per-package by providing them like this in your
ember-cli-build.js:

```js
// In your ember-cli-build.js file
let app = new EmberApp(defaults, {
  autoImport: {
    modules: {
      qunit: { include: false }
    }
  }
});
```

Suported Options

 - `include`: _boolean, defaults to true_. If set to false,
   ember-auto-imports will ignore this package. Can be helpful if the
   package is already included another way (like a shim from some
   other Ember addon).


Credit / History
------------------------------------------------------------------------------

Takes inspiration and some code from ember-browserify and
ember-cli-cjs-transform. This package is basically what you get when
you combine the ideas from those two addons.


Contributing
------------------------------------------------------------------------------

### Installation

* `git clone <repository-url>`
* `cd ember-auto-import`
* `yarn install`

### Linting

* `yarn lint:js`
* `yarn lint:js --fix`

### Running tests

Our test setup is not typical for an Ember addon. While there is a normal Ember addon dummy app that you can run the normal way (with `ember test`), we also have multiple other apps under `/test-apps`. This lets us test how ember-auto-import gets integrated under multiple scenarios. 

The test apps share the top-level node_modules automatically, no need to run separate npm installs for them. They should get symlinked to each other automatically when you install the top-level deps (see `./scripts/link-them.sh`). You can also `cd` directly into any of the test apps and run its tests like a normal Ember app.

The top-level test runner script (`/scripts/test.sh`) probably only works under Unix-like environments, because it relies on GNU parallel to run all the apps at once.

Index of test apps:

 - sample-direct: an app that directly uses ember-auto-import
 - sample-addon: an addon that uses ember-auto-import to implement a feature that will be used in apps, and also exercises auto-import for devDependencies in its dummy app.
 - sample-indirect: an app that uses sample-addon but does not directly depend on ember-auto-import
 - sample-failure: an addon that should refuse to build due to importing a devDependency from addon code


License
------------------------------------------------------------------------------

This project is licensed under the [MIT License](LICENSE.md).
