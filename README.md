ember-auto-import
==============================================================================

Just `import` from NPM, with zero configuration.

Spiritual successor to ember-browserify, but powered by a more modern packager (Rollup).

Installation
------------------------------------------------------------------------------

```
ember install ember-auto-import
```


Usage
------------------------------------------------------------------------------

Add whatever dependency you want to your project using NPM or yarn:

```
npm install --save-dev lodash-es
  or
yarn add --dev lodash-es
```

Then just import it from your Ember app code:

```
import { capitalize } from 'lodash-es';
```

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
