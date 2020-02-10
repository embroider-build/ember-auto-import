# Changelog

### 1.5.3
 - HOUSEKEEPING: upgrading deps that are failing security audits (but there was no actual vulnerability for ember-auto-import users)
 - HOUSEKEEPING: switch CI to GitHub actions
 - BUGFIX: lazily read babel config (helps interoperability with Embroider) by @stefanpenner

### 1.5.2
 - BUGFIX: since 1.5.0 we were using `@babel/present-env` but not directly depending on it, which would break apps that didn't happen to already have a copy.

### 1.5.1
 - BUGFIX: upgrade handlebars to eliminate a GitHub security advisory. We don't run untrusted templates, so there was no actual security risk introduced by ember-auto-import.

### 1.5.0
 - ENHANCEMENT: all dependencies now go through @babel/preset-env by default. This ensures that you never ship code that violates your app's declared `config/targets.js`. There is an explicit `skipBabel` option for when you know for sure a package shouldn't be transpiled.
 - DOCS: node polyfills FAQ by @jenweber
 - DOCS: fixed syntax highlighting by @ctjhoa

### 1.4.1
 - BUGFIX: remove ";" from concatenated CSS by @bendemboski

## 1.4.0
 - BUGFIX: don't polyfill Node behaviors by default, by @tmquinn. This is known to cause BREAKAGE in apps that accidentally relied on the bug behavior. See https://github.com/ef4/ember-auto-import/blob/a1bc3057c89fa2d4a81dc77f55b9674123072f2a/README.md#i-upgraded-my-ember-auto-import-version-and-now-things-dont-import-what-changed
 - ENHANCEMENT: respect ember-auto-import options on the app even when the app itself doesn't depend directly on ember-auto-import, by @tmquinn.
 - BUGFIX: disable size shaming by default.
 - DOCS: Add info on importing a dependency from app folder, by @Alonski.

## 1.3.0

- ENHANCEMENT: if you customize the webpack config to emit CSS, we will include the CSS in your ember app. Thanks @bendemboski.
- DOCS: readme enhancements by @Turbo87, @0xadada, and @ctjhoa

## 1.2.21

- BUGFIX: restrict our webpack dependency to exclude 4.29.0. See https://github.com/ef4/ember-auto-import/issues/192. Thanks @efx.

## 1.2.20

- SECURITY: disallow handlebars < 4.0.13 due to https://www.npmjs.com/advisories/755. We don't pass any untrusted input into handlebars, so there is no known actual vulnerability in ember-auto-import, but this will help people avoid getting audit warnings about their apps. Thanks @knownasilya.
- DOCS: updated docs on publicAssetURL by @jrjohnson
- HOUSEKEEPING: gitignore fixes by @buschtoens.
- BUGFIX: make sure a user-provided `noParse` in custom webpack config can't break our own internal usage of that feature.

## 1.2.19

- BUGFIX: some changes to imports were not taking effect until after an ember-cli restart.

## 1.2.18

- BUGFIX: fixed a crash for people using certain customized vendor.js output paths.
- INTERNALS: we now compile in the strictest Typescript mode.

## 1.2.17

- ENHANCEMENT: interoperability with ember-cli-typescript 2.0, so that imports work in Typescript code, by @buschtoens.

## 1.2.16

- ENHANCEMENT: Babel 7 support. Any combination of app & addons using Babel 6 and 7 should now work, and each one will be parsed with its own preferred parser and options.

## 1.2.15

- BUGFIX: the previous release could result in a broken build if your broccoli temp location was access through a symlink.

## 1.2.14

- ENHANCEMENT: new "forbidEval" option supports sites with strict CSP.
- BUGFIX: don't leak temp dirs
- BUGFIX: support apps with closed-over require & define by @noslouch and @ef4
- DOCS: package.json metadata update by @chadian

## 1.2.13

- BUGFIX: only attempt to insert before a sourceMapURL that's anchored to the end of the file.

## 1.2.12

- BUGFIX: an analyzer rebuild bug. Hopefully the last one since I added a bunch of new test coverage around it.
- BUGFIX: we weren't matching the exact sort order required by fs-tree-diff.

## 1.2.11

- BUGFIX: apps with customized outputPaths work again.
- BUGFIX: fixed issues around building when tests are disabled.
- ENHANCEMENT: preserve pre-existing vendor sourcemaps

## 1.2.10

- BUGFIX: 1.2.9 re-broke production builds. Now that is fixed _and_ we have test coverage for it. Ahem.

## 1.2.9

- BUGFIX: the compatibility workaround in 1.2.7 had the side-effect of breaking live-reload of addon code.

## 1.2.8

- BUGFIX: previous release broke production builds for a silly reason.

## 1.2.7

- HOUSEKEEPING: changes for compatibility with ember-cli 3.4-beta.
- ENHANCEMENT: more robust heuristic for detecting the public asset path, plus the option to configure it manually.

## 1.2.6

- BUGFIX: fix IE11 support by @zonkyio
- ENHANCEMENT: allow resolution of peerDependencies

## 1.2.5

- BUGFIX: use correct asset path when dynamic imports only appear within dependencies (and not within the app itself)

## 1.2.4

- ENHANCEMENT: discover imports in coffeescript.

## 1.2.3

- BUGFIX: tolerate multiple copies of the same dependency as long as they have the same version number (only one will be included in the app).

## 1.2.2

- BUGFIX: some chunk files could appear in the final built app even though they weren't needed. Harmless, but fixed.
- ENHANCEMENT: reload package.json during development so you don't need to restart ember-cli after adding new dependencies.
- ENHANCEMENT: automatically configure production asset fingerprinting so it doesn't interfere with dynamic chunk loading.
- ENHANCEMENT: add an env var that causes webpack's console output to be visible.

## 1.2.1

- BUGFIX: the previous release accidentally broke interactive rebuilds!

## 1.2.0

- ENHANCEMENT: dynamic import(). See https://github.com/ef4/ember-auto-import#dynamic-import

## 1.1.0

- BUGFIX: play nicer with other preprocessors by preserving non-JS files in the trees we analyze.
- ENHANCEMENT: add an "alias" config option for redirecting imports from one module to another.

## 1.0.1

- BUGFIX: fixed a string escaping issue that was breaking windows builds. Thanks @houfeng0923.

## 1.0.0

- BUGFIX: fixed an exception after a file with imports was deleted
- Making this 1.0.0 because no major issues have surfaced in the alpha and I think the public API is fairly stable. My outstanding TODO list is all either additive or internals-only for compatibility with ember-cli canary.

## 1.0.0-alpha.0

- ENHANCEMENT: we now run a single Webpack build for an entire application, regardless of how many addons and/or the app itself are using ember-auto-import. This provides the best possible deduplication and minimal size.
- BREAKING: the build customization options have changed. It's no longer possible to customize webpack per-module, since we're running a single global webpack build. I also removed documentation on how to swap out the webpack bundler with something else, because in practice we'll want addons to be able to standardize on one strategy.
- I'm making this a candidate for a 1.0 release because our public API is now where I want it and it seems unlikely to need breaking changes in the near future. This is an endorsement of public API stability, not implementaiton stability, which I expect to keep improving as more people adopt and report bugs.

## 0.2.5

- BUGFIX: ensure our import analyzer always runs before babel has a chance to transpile away the imports

## 0.2.3

- BUGFIX: switch to enhanced-resolve to get correct entrypoint discovery semantics for every case of `browser` and `module`

## 0.2.2

- PERFORMANCE: add rebuild caching.

## 0.2.1

- BUGFIX: fix an exception when the app has no vendor directory

## 0.2.0

- ENHANCEMENT: respect `module` and `browser` fields in package.json
- ENHANCEMENT: work inside addons
- ENHANCEMENT: add option for ignoring specific modules
- ENHANCEMENT: use the ember app's babel settings to configure our babel parser to match
- ENHANCEMENT: support importing non-main entrypoint modules from arbitrary NPM packages
- ENHANCEMENT: make bundler strategies pluggable
- ENHANCEMENT: switch default bundler strategy from Rollup to Webpack
