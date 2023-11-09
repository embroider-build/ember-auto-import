# ember-auto-import

Just `import` from NPM, with zero configuration.

## Installation

```
npm install --save-dev ember-auto-import webpack
```

If you're upgrading from 1.x to 2.x [see the upgrade guide](./docs/upgrade-guide-2.0.md).

## Usage

Add whatever dependency you want to your project using NPM or yarn like:

```
npm install --save-dev lodash-es
```

or

```
yarn add --dev lodash-es
```

Then just import it from your Ember app code:

```js
import { capitalize } from 'lodash-es';
```

There is no step two. Works from both app code and test code.

## Dynamic Import

In addition to static top-level `import` statements, you can use dynamic `import()` to lazily load your dependencies. This can be great for reducing your initial bundle size.

Dynamic import is currently a Stage 3 ECMA feature, so to use it there are a few extra setup steps:

1.  `npm install --save-dev babel-eslint`
2.  In your `.eslintrc.js` file, add

        parser: 'babel-eslint'

3.  In your `ember-cli-build.js` file, enable the babel plugin provided by ember-auto-import:

```js
let app = new EmberApp(defaults, {
  babel: {
    plugins: [require.resolve('ember-auto-import/babel-plugin')],
  },
});
```

Once you're setup, you can use dynamic `import()` and it will result in loading that particular dependency (and all its recursive dependencies) via a separate Javascript file at runtime. Here's an example of using dynamic import from within a `Route`, so that the extra library needed for the route is loaded at the same time the data is loaded:

```js
export default Route.extend({
  model({ id }) {
    return Promise.all([
      fetch(`/data-for-chart/${id}`).then(response => response.json()),
      import('highcharts').then(module => module.default),
    ]).then(([dataPoints, highcharts]) => {
      return { dataPoints, highcharts };
    });
  },
});
```

If you're using custom deployment code, make sure it will include all the Javascript files in `dist/assets`, not just the default `app.js` and `vendor.js`.

## App imports

`ember-auto-import` was originally designed to allow Ember apps to import from npm packages easily, and would have no influence on your app's files (i.e. files that exist in your `app` folder). This meant that every time you had an import like `import someBigLib from 'my-app-name/lib/massive'` there was no way for you to: 

- use webpack plugins to influence the loading of `my-app-name/lib/massive`
- dynamically import `my-app-name/lib/massive` in such a way that it wouldn't increase the size of your asset.
- import assets from your app that would go through webpack loaders

Fortunatly there is a way to configure ember-auto-import to work on certain parts of your app using the `allowAppImports` configuration option. If you set the option to: 

```js
let app = new EmberApp(defaults, {
  autoImport: {
    allowAppImports: [ 'lib/*' ],
  }
});
```

Then the `my-app-name/lib/massive` file (and all other files in lib) would now be handled by ember-auto-import. This would then allow you to dynamically `import('my-app-name/lib/massive')` which means that you can dynamically load parts of your app on demand without first splitting them into an addon or an npm package.

## Customizing Build Behavior

While most NPM packages authored in CommonJS or ES Modules will Just Work, for others you may need to give ember-auto-import a hint about what to do.

You can set options like this in your ember-cli-build.js:

```js
// In your ember-cli-build.js file
let app = new EmberApp(defaults, {
  autoImport: {
    alias: {
      // when the app tries to import from "plotly.js", use
      // the real package "plotly.js-basic-dist" instead.
      'plotly.js': 'plotly.js-basic-dist',

      // you can also use aliases to pick a different entrypoint
      // within the same package. This can come up when the default
      // entrypoint only works in Node, but there is also a browser
      // build available (and the author didn't provide a "browser"
      // field in package.json that would let us detect it
      // automatically).
      handlebars: 'handlebars/dist/handlebars',

      // We do a prefix match by default, so the above would also
      // convert "handlebars/foo" to "handlebars/dist/handlesbars/foo".
      // If instad you want an exact match only, you can use a trailing "$".
      // For example, this will rewrite "some-package/alpha" to "customized"
      // but leave "some-package/beta" alone.
      'some-package/alpha$': 'customized',
    },
    allowAppImports: [
      // minimatch patterns for app files that you want to be handled by ember-auto-import
    ],
    exclude: ['some-package'],
    skipBabel: [
      {
        // when an already-babel-transpiled package like "mapbox-gl" is
        // not skipped, it can produce errors in the production mode
        // due to double transpilation
        package: 'mapbox-gl',
        semverRange: '*',
      },
    ],
    watchDependencies: [
      // trigger rebuilds if "some-lib" changes during development
      'some-lib',
      // trigger rebuilds if "some-lib"'s inner dependency "other-lib" changes
      ['some-lib', 'other-lib'],
    ],
    webpack: {
      // extra webpack configuration goes here
    },
  },
});
```

Supported Options

- `alias`: _object_, Map from imported names to substitute names that will be imported instead. This is a prefix match by default. To opt out of prefix-matching and only match exactly, add a `$` suffix to the pattern.
- `allowAppImports`: _list of strings, defaults to []_. Files in your app folder that match these minimatch patterns will be handled by ember-auto-import (and thus Webpack) and no longer be part of the regular ember-cli pipeline.
- `exclude`: _list of strings, defaults to []_. Packages in this list will be ignored by ember-auto-import. Can be helpful if the package is already included another way (like a shim from some other Ember addon).
- `forbidEval`: _boolean_, defaults to false. We use `eval` in development by default (because that is the fastest way to provide sourcemaps). If you need to comply with a strict Content Security Policy (CSP), you can set `forbidEval: true`. You will still get sourcemaps, they will just use a slower implementation.
- `insertScriptsAt`: _string_, defaults to undefined. Optionally allows you to take manual control over where ember-auto-import's generated `<script>` tags will be inserted into your HTML and what attributes they will have. See "Customizing HTML Insertion" below.
- `insertStylesAt`: _string_, defaults to undefined. Optionally allows you to take manual control over where ember-auto-import's generated `<link rel="stylesheet">` tags (if any) will be inserted into your HTML and what attributes they will have. See "Customizing HTML Insertion" below.
- `publicAssetURL`: the public URL to your `/assets` directory on the web. Many apps won't need to set this because we try to detect it automatically, but you will need to set this explicitly if you're deploying your assets to a different origin than your app (for example, on a CDN) or if you are using `<script defer>` (which causes scripts to be unable to guess what origin they loaded from).
- `skipBabel`: _list of objects, defaults to []_. The specified packages will be skipped from babel transpilation.
- `watchDependencies`: _list of strings or string arrays, defaults to []_. Tells ember-auto-import that you'd like to trigger a rebuild if one of these auto-imported dependencies changes. Pass a package name that refers to one of your own dependencies, or pass an array of package names to address a deeper dependency.
- `webpack`: _object_, An object that will get merged into the configuration we pass to webpack. This lets you work around quirks in underlying libraries and otherwise customize the way Webpack will assemble your dependencies.

## Usage from Addons

Using ember-auto-import inside an addon is almost exactly the same as inside an app.

### Installing ember-auto-import in an addon

To add ember-auto-import to your addon:

- add ember-auto-import to your `dependencies`, not your `devDependencies`, so it will be present when your addon is used by apps
- add webpack to your `devDependencies` (to support your test suite) but not your `dependencies` (the app's version will be used)
- document for your users that their app must depend on ember-auto-import >= 2 in order to use your addon
- configure ember-auto-import (if needed) in your `index.js` file (not your `ember-cli-build.js` file), like this:

  ```js
  // In your addon's index.js file
  module.exports = {
    name: 'sample-addon',
    options: {
      autoImport: {
        exclude: ['some-package'],
      },
    },
  };
  ```

- if your addon uses [Dynamic Import](#dynamic-import), it is [required](https://github.com/babel/ember-cli-babel#options) that you
  register the babel plugin in your `index.js` instead of `ember-cli-build.js`:
  ```js
  // index.js
  module.exports = {
    options: {
      babel: {
        plugins: [require.resolve('ember-auto-import/babel-plugin')],
      },
    },
  };
  ```

### Caveats in addons

- ember-auto-import will refuse to import `devDependencies` of your addon into addon code (because that would fail in a consuming application). You _can_ import `devDependencies` into your test suite & dummy app.
- ember-auto-import will not detect import statements inside your `app` folder. This is because the files inside `app` are conceptually not part of your addon's own package namespace at all, so they don't get access to your addon's dependencies. Do all your auto-importing from the `addon` folder, and reexport in `app` as needed.
- while addons are allowed to pass the `autoImport.webpack` option to add things to the webpack config, this makes them less likely to be broadly compatible with apps using different webpack versions. If you need to rely on a specific webpack feature, you should document which versions of webpack you support.

## Customizing HTML Insertion

ember-auto-import uses webpack to generate one or more chunk files containing all your auto-imported dependencies, and then ember-auto-import inserts `<script>` tags to your HTML to make sure those chunks are included into your app (and tests, as appropriate). By default, the "app" webpack chunk(s) will be inserted after Ember's traditional "vendor.js" and the "tests" webpack chunk(s) will be inserted after "test-support.js".

If you need more control over the HTML insertion, you can use the `insertScriptsAt` option (or the `insertStylesAt` option, which is exactly analogous but for standalone CSS instead of JS). To customize HTML insertion:

1. Set `insertScriptsAt` to a custom element name. You get to pick the name so that it can't collide with any existing custom elements in your site, but a good default choice is "auto-import-script":

   ```js
   let app = new EmberApp(defaults, {
     autoImport: {
       insertScriptsAt: 'auto-import-script',
     },
   });
   ```

2. In your `index.html` and `tests/index.html`, use the custom element to designate exactly where you want the "app" and "tests" entrypoints to be inserted:

   ```diff
    <!-- in index.html -->
    <body>
      {{content-for "body"}}
      <script src="{{rootURL}}assets/vendor.js"></script>
   +   <auto-import-script entrypoint="app"></auto-import-script>
      <script src="{{rootURL}}assets/your-app.js"></script>
      {{content-for "body-footer"}}
    </body>
   ```

   ```diff
    <!-- in tests/index.html -->
    <body>
      {{content-for "body"}}
      {{content-for "test-body"}}

      <div id="qunit"></div>
      <div id="qunit-fixture">
        <div id="ember-testing-container">
          <div id="ember-testing"></div>
        </div>
      </div>

      <script src="/testem.js" integrity=""></script>
      <script src="{{rootURL}}assets/vendor.js"></script>
   +   <auto-import-script entrypoint="app"></auto-import-script>
      <script src="{{rootURL}}assets/test-support.js"></script>
   +   <auto-import-script entrypoint="tests"></auto-import-script>
      <script src="{{rootURL}}assets/your-app.js"></script>
      <script src="{{rootURL}}assets/tests.js"></script>

      {{content-for "body-footer"}}
      {{content-for "test-body-footer"}}
    </body>
   ```

3. Any attributes other than `entrypoint` will be copied onto the resulting `<script>` tags inserted by ember-auto-import. For example, if you want `<script defer></script>` you can say:

   ```html
   <auto-import-script defer entrypoint="app"> </auto-import-script>
   ```

   And this will result in output like:

   ```html
   <script defer src="/assets/chunk-12341234.js"></script>
   ```

Once you enable `insertScriptsAt` you _must_ designate places for the "app" and "tests" entrypoints if you want ember-auto-import to work correctly. You may also optionally designate additional entrypoints and manually add them to the webpack config. For example, you might want to build a polyfills bundle that needs to run before `vendor.js` on pre-ES-module browsers:

```js
// ember-cli-build.js
let app = new EmberApp(defaults, {
  autoImport: {
    insertScriptsAt: 'auto-import-script',
    webpack: {
      entry: {
        polyfills: './lib/polyfills.js',
      },
    },
  },
});

// lib/polyfills.js
import 'core-js/stable';
import 'intl';
```

```html
<!-- index.html -->
<auto-import-script nomodule entrypoint="polyfills"></auto-import-script>
<script src="{{rootURL}}assets/vendor.js"></script>
<auto-import-script entrypoint="app"></auto-import-script>
<script src="{{rootURL}}assets/your-app.js"></script>
```

## Fastboot

ember-auto-import works with [Fastboot](https://ember-fastboot.com) to support server-side rendering.

When using Fastboot, you may need to add your Node version to `config/targets.js` in order to only use Javascript features that work in that Node version. When you do this, it may prevent webpack from being able to infer that it should still be doing a build that targets the web. This may result in an error message like:

```
For the selected environment is no default script chunk format available:
JSONP Array push can be chosen when 'document' or 'importScripts' is available.
CommonJs exports can be chosen when 'require' or node builtins are available.
Make sure that your 'browserslist' includes only platforms that support these features or select an appropriate 'target' to allow selecting a chunk format by default. Alternatively specify the 'output.chunkFormat' directly.
```

You can fix this by setting the target to web explicitly:

```js
// ember-cli-build.js
let app = new EmberApp(defaults, {
  autoImport: {
    webpack: {
      target: 'web',
    },
  },
});
```

## FAQ

### `global is undefined` or `can't find module "path"` or `can't find module "fs"`

You're trying to use a library that is written to work in NodeJS and not in the browser. You can choose to polyfill the Node feature you need by passing settings to webpack. For example:

```
let app = new EmberApp(defaults, {
  autoImport: {
    webpack: {
      node: {
        global: true,
        fs: 'empty'
      }
    }
  }
```

See [webpack's docs on Node polyfills](https://v4.webpack.js.org/configuration/node/).

### I use Content Security Policy (CSP) and it breaks ember-auto-import.

See `forbidEval` above.

### I'm trying to load a jQuery plugin, but it doesn't attach itself to the copy of jQuery that's already in my Ember app.

Ember apps typically get jQuery from the `ember-source` or `@ember/jquery` packages. Neither of these is the real `jquery` NPM package, so ember-auto-import cannot "see" it statically at build time. You will need to give webpack a hint to treat jQuery as external:

```js
// In your ember-cli-build.js file
let app = new EmberApp(defaults, {
  autoImport: {
    webpack: {
      externals: { jquery: 'jQuery' },
    },
  },
});
```

Also, some jQuery plugins like masonry and flickity have [required manual steps to connect them to jQuery](https://github.com/ef4/ember-auto-import/issues/59#issuecomment-405391414).

### I upgraded my `ember-auto-import` version and now things don't import. What changed?

As of version `1.4.0`, by default, `ember-auto-import` does not include webpack's automatic polyfills for certain Node packages.
Some signs that your app was depending on these polyfills by accident are things like "global is not defined," "can't resolve path," or "default is not a function."
You can opt-in to [Webpack's polyfills](https://webpack.js.org/configuration/node/), or install your own.
See [this issue](https://github.com/ef4/ember-auto-import/issues/224#issuecomment-503400386) for an example.

### I get `Uncaught ReferenceError: a is not defined` [251](https://github.com/ef4/ember-auto-import/issues/251) with an already babel transpiled addon, e.g: `mapbox-gl`

We should skip that specific addon from the ember-auto-import's babel transpilation as:

```js
// In your app's ember-cli-build.js file or check the `Usage from Addons` section for relevant usage of the following in addons
let app = new EmberApp(defaults, {
  autoImport: {
    skipBabel: [
      {
        package: 'mapbox-gl',
        semverRange: '*',
      },
    ],
  },
});
```

### I want to import a module for side effects only.

Some modules, often times polyfills, don't provide values meant for direct import. Instead, the module is meant to provide certain side affects, such as mutating global variables.

To import a module for side affects only, you can simply [import the module directly](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import#import_a_module_for_its_side_effects_only).<br>
Any side affects the module provides will take affect.

Example: the `eventsource` package provides a ready to use [eventsource-polyfill.js](https://github.com/EventSource/eventsource/blob/master/example/eventsource-polyfill.js) module.

This can be imported like:

```js
// In any js file, likely the file you need to access the polyfill, purely for organization.

// Importing the polyfill adds a new global object EventSourcePolyfill.
import 'eventsource/example/eventsource-polyfill.js';
```

## Debugging Tips

Set the environment variable `DEBUG="ember-auto-import:*"` to see debug logging during the build.

To see Webpack's console output, set the environment variable `AUTO_IMPORT_VERBOSE=true`.

## Credit / History

Takes inspiration and some code from ember-browserify and ember-cli-cjs-transform. This package is basically what you get when you combine the ideas from those two addons.

## Contributing

[See CONTRIBUTING.md](CONTRIBUTING.md)

## License

This project is licensed under the [MIT License](LICENSE.md).
