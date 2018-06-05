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
    qunit: { include: false }
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

* `ember test` – Runs the test suite on the current Ember version
* `ember test --server` – Runs the test suite in "watch mode"
* `ember try:each` – Runs the test suite against multiple Ember versions

### Running the dummy application

* `ember serve`
* Visit the dummy application at [http://localhost:4200](http://localhost:4200).

For more information on using ember-cli, visit [https://ember-cli.com/](https://ember-cli.com/).

License
------------------------------------------------------------------------------

This project is licensed under the [MIT License](LICENSE.md).
