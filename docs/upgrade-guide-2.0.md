# ember-auto-import 2.0

## Quick Summary

- apps that have custom webpack config will need to check that their config is compatible with webpack 5
- apps must add webpack to their own dependencies (`yarn add --dev webpack@5` or `npm install --save-dev webpack@5`)
- apps that were adding css handling (like `css-loader`, `style-loader`, and `MiniCSSExtraPlugin`) to the webpack config must remove those, because they're now included by default for compatibility with the embroider v2 package spec.
- apps should confirm that their deployment strategy includes all files produced under `dist` (not just the traditional expected ones like `dist/assets/your-app.js` and `dist/assets/vendor.js`)
- addons that upgrade to ember-auto-import >= 2 will only work in apps that have ember-auto-import >= 2, so they should do their own semver major releases when they upgrade
- our `alias` option has changed slightly to align better with how it works in webpack

# Details

### Webpack 5 Upgrade

ember-auto-import 2.0 upgrades from webpack 4 to 5. This is a potentially breaking change for any package that directly adds to webpack config. Most apps will not experience any breakage, because most common webpack 4 configs still work in webpack 5.

One of the changes in webpack 5 is the removal of automatic node polyfills, but ember-auto-import _already_ imposed that policy by default on all Ember apps, so this only affects you if you have customized it. If you did customize the `node` option to `webpack` however, you will [probably need to make adjustments](https://gist.github.com/ef4/d2cf5672a93cf241fd47c020b9b3066a).

## Apps responsible for installing webpack

Apps are required to depend on webpack. This gives the app control over the exact webpack version in use, and it makes it possible for the app to import directly from webpack for access to features like `DefinePlugin` that it may want to put into the webpack config.

Addons that use ember-auto-import 2.0 should *not* put webpack into `dependencies` (the app's version will be used instead). They will need it in `devDependencies` in order to build their own dummy app.

ember-auto-import will not list webpack in `peerDependencies`, because the ember-auto-import package does double duty -- it needs webpack when used by an app, but does *not* need webpack when used by an addon, and we don't want addons to accidentally install webpack. 

### Embroider v2 Addon Format support

ember-auto-import 2.0 handles Embroider v2-formatted addons for apps that aren't yet using Embroider.

This is potentially breaking because it adds more stuff to the webpack config that people could have been manually controlling before. Specifically:

- v2 addons are allowed to import css, so we add the appropriate webpack loaders
- v2 addons are allowed to contain inline templates, decorators, and embroider macros, so all of these are now supported by ember-auto-import

### Drop babel 6

ember-auto-import 1.0 ships a complete copy of babel 6 in order to parse any apps or addons that are using babel 6 (because we need to be able to install their syntax plugins in order to parse their code without errors). That support is removed, the minimum supported babel is 7.

It's still OK to depend on an addon that uses babel 6, but that addon cannot use ember-auto-import.

### Inject entry chunks directly in index.html

Today entry chunks are appended to vendor.js (and vendor.css if you manually added some webpack config that emits css). This is bad because it interacts badly with ember-cli's source mapping, it's more expensive in the build, it defeats some caching, and it's more complicated to get right. It also requires us to monkey-patch ember-cli, and it leads to a painful bug if the parent package of the chosen leader never calls `super` include `included`.

2.0 inserts script (and link) tags directly into index.html instead. This is better for all the reasons above. The only potential downside is that the presence of these new files in dist may impact people with unnecessarily-specific deployment code that, instead of deploying `dist/*` like they should, deploys only `dist/assets/app.js`, `dist/assets/vendor.js`, etc, without noticing the new `dist/assets/chunk*.{js,css}` we emitted.

### Mandatory top-level auto-import

When used by an addon, ember-auto-import 2.0 will assert that the top-level app package has ember-auto-import >= 2.0. Therefore, addons that upgrade to ember-auto-import 2.0 should do their own semver major releases, and document that they now require ember-auto-import 2.0 in the app. This implies that semver major releases are needed recursively up the dependency chain if an addon is using an addon that upgrades to ember-auto-import 2.0.

There are too many top-level concerns governed by auto-import to continue to sneak it in via addons, without giving the app any control over the version range. Also, ember-auto-import is effectively a polyfill for Embroider, which will become the default for new apps soon. So apps should be moving toward working with ember-auto-import if they haven't already.

We will still perform leader election, but only copies that are semver-compatible with the app will be eligible to lead. This allows addons to rely on new features in minor releases of ember-auto-import.

## Alias Option

In ember-auto-import 1.0, `autoImport.alias` only applied to exact matches. In 2.0, it is a prefix match by default, and you can make it an exact match using a trailing `$`. We not follow the same semantics as https://webpack.js.org/configuration/resolve/#resolvealias.

## Clarifying our Semver Contract for Addons

When an app upgrades to a new major release of ember-auto-import, any of that app's addons that use an older major release of ember-auto-import are still supported, with one exception: addons that directly emit custom webpack config are not guaranteed to work in future major releases of ember-auto-import. For this reason, addons should:

1. first, try not to need custom webpack config by
   - working with us to make a first-class API in ember-auto-import that does the thing you need in a declarative way
   - fixing upstream bugs in libraries so they will build correctly without custom config
2. if you do need custom webpack config, document for your users what versions of ember-auto-import and webpack (in the app) you support.

We will not automatically error if an addon using ember-auto-import 1.0 emits custom webpack config in an app using ember-auto-import 2.0, because after a review I believe the vast majority of cases in the wild will actually work fine. But in general, we can't _guarantee_ that will work across any future major releases.
