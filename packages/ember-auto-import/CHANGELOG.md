# Changelog
## Release (2023-12-23)

ember-auto-import 2.7.2 (patch)

#### :bug: Bug Fix
* `ember-auto-import`, `@ef4/test-scenarios`
  * [#605](https://github.com/embroider-build/ember-auto-import/pull/605) Add es-compat to make asset loaders work as expected ([@ef4](https://github.com/ef4))
  * [#606](https://github.com/embroider-build/ember-auto-import/pull/606) Fix dynamic import inside allowAppImports dirs ([@ef4](https://github.com/ef4))

#### Committers: 1
- Edward Faulkner ([@ef4](https://github.com/ef4))
## Release (2023-12-12)

ember-auto-import 2.7.1 (patch)

#### :bug: Bug Fix
* `ember-auto-import`, `@ef4/test-scenarios`
  * [#603](https://github.com/embroider-build/ember-auto-import/pull/603) Fix imports with a query part ([@simonihmig](https://github.com/simonihmig))
* `ember-auto-import`
  * [#602](https://github.com/embroider-build/ember-auto-import/pull/602) Allow arbitrary extensions for app-imports ([@simonihmig](https://github.com/simonihmig))

#### :house: Internal
* [#604](https://github.com/embroider-build/ember-auto-import/pull/604) update release-plan ([@mansona](https://github.com/mansona))

#### Committers: 2
- Chris Manson ([@mansona](https://github.com/mansona))
- Simon Ihmig ([@simonihmig](https://github.com/simonihmig))
## Release (2023-11-24)

ember-auto-import 2.7.0 (minor)

#### :rocket: Enhancement
* `ember-auto-import`
  * [#587](https://github.com/embroider-build/ember-auto-import/pull/587) Feature: allowAppImports ([@mansona](https://github.com/mansona))
  * [#596](https://github.com/embroider-build/ember-auto-import/pull/596) Support private properties and static blocks ([@andreyfel](https://github.com/andreyfel))

#### :memo: Documentation
* `ember-auto-import`
  * [#594](https://github.com/embroider-build/ember-auto-import/pull/594) Add section on importing a module for side affects only to the README.md ([@keithZmudzinski](https://github.com/keithZmudzinski))

#### :house: Internal
* `addon-template`
  * [#598](https://github.com/embroider-build/ember-auto-import/pull/598) Add release-plan for automating releases ([@mansona](https://github.com/mansona))
* Other
  * [#597](https://github.com/embroider-build/ember-auto-import/pull/597) update package-lock.json ([@mansona](https://github.com/mansona))
* `app-template`, `ember-auto-import`
  * [#585](https://github.com/embroider-build/ember-auto-import/pull/585) Update ci ([@ef4](https://github.com/ef4))

#### Committers: 4
- Andrey Fel ([@andreyfel](https://github.com/andreyfel))
- Chris Manson ([@mansona](https://github.com/mansona))
- Edward Faulkner ([@ef4](https://github.com/ef4))
- Keith Zmudzinski ([@keithZmudzinski](https://github.com/keithZmudzinski))

### 2.6.3

- BUGFIX: the babel-plugin-ember-template-compilation bugfix in the previous release was missing an explicit dependency declaration, so it didn't work 100% of the time. Fix by @mansona.

### 2.6.2

- BUGFIX: automatically detect when our module shims need AMD dependencies. This eliminates the previous `earlyBootSet` manual workaround.
- BUGFIX: use babel-plugin-ember-template-compilation on new-enough ember versions by @candunaj
- INTERNAL: update tests for latest ember canary
- BUGFIX: Fix wrong detection of ember-source version for earlyBootSet by @simonihmig

### 2.6.1

- BUGFIX: `earlyBootSet` now defaults to empty, because it was causing problems for some apps. If you need it you need to turn it on explicitly. @NullVoxPopuli [568](https://github.com/ef4/ember-auto-import/pull/568)

### 2.6.0

- ENHANCEMENT: new option `earlyBootSet` allows you to work around compatibility problems between classic addons and v2 addons by @NullVoxPopuli [553](https://github.com/ef4/ember-auto-import/pull/553)

### 2.5.0

- ENHANCEMENT: add support for node type=module by @hjdivad [544](https://github.com/ef4/ember-auto-import/pull/544)
- INTERNAL: upgrade to @embroider/shared-internals 2.0

### 2.4.3

- BUGFIX: Move Dynamic Template Import error to runtime instead of a build error by @mansona
- BUGFIX: Respect v2 addon's explicit externals list
- INTERNAL: add @babel/core to app and addon test templates for compatibility with upcoming ember versions.
- DOCS: Improve upgrade guide by @pomm0
- BUGFIX: windows path handling fix by @void-mAlex
- DOCS: Fix typo by @berdeblock

### 2.4.2

- BUGFIX: prioritize the user's webpack devTool setting over the default provided by our forbidEval setting.

### 2.4.1

- BUGFIX: avoid unnecessary full page reloads
- DOCS: clarify upgrade guide for addon by @ctjhoa
- BUGFIX: don't let broccoli-asset-rev mess with css chunks
- INTERNALS: upgrade fs-extra and resolve-package-path by @SergeAstapov

### 2.4.0

- ENHANCEMENT make v2 addon's with CSS work in fastboot out of the box
- INTERNAL update @embroider/macros and @embroider/shared-internals to 1.0 by @SergeAstapov
- BUGFIX correctly merge user-provided webpack `externals` with our own, by @vstefanovic97

### 2.3.0

- INTERNAL update to latest @embroider/internals
- ENHANCEMENT support v2 addons that contain @embroider/macros
- ENHANCEMENT better error messages by @NullVoxPopuli

### 2.2.4

- BUGFIX: Avoid EBADF on ReadStream early close in Node 12 by @maxfierke
- BUGFIX: use junctions on windows as needed to avoid permissions problem
- INTERNAL: mark test-scenarios package as private by @rwjblue
- DOCS: fix link to upgrade guide in changelog by @ndekeister-us
- METADATA: add `directory` metadata to package.json by @Turbo87

### 2.2.3

- BUGFIX: `export * from` syntax was not detected.

### 2.2.2

- BUGFIX: pass `styleLoaderOptions` and `cssLoaderOptions` correctly by @boris-petrov

### 2.2.1

- BUGFIX: Prevent loss of characters in case of false end-partial-match by @timmorey
- INTERNAL: Upgrade scenario-tester

### 2.2.0

- ENHANCEMENT: significantly faster builds.
- ENHANCEMENT: improved error messages for resolution errors by @NullVoxPopuli
- HOUSEKEEPING: adjust which files get published by @buschtoens
- ENHANCEMENT: relax semver check to tolerate shared versions that satisfy all consumers

### 2.1.0

- FEATURE: You can now control exactly how and where ember-auto-import will insert tags into your HTML using the `insertScriptsAt` and `insertStylesAt` options.
- FEATURE: You can add custom entrypoints to the webpack config. Combined with `insertScriptsAt`, this makes it possible to (for example) auto-import a family of polyfills that must run before Ember's traditional `vendor.js`. It's also likely to be helpful for building webworkers or other similar standalone targets.
- FEATURE: We now properly optimize TypeScript's `import type` syntax, meaning if you only import the types from a package it will not be included in your build. By @buschtoens.
- DOCS: fixes in README by @stefanpenner
- DOCS: fixes in upgrade guide by @kiwi-josh

### 2.0.2

- BUGFIX: entry chunks should respect `publicAssetURL`

### 2.0.1

- BUGFIX: avoid warning spew from babel about loose mode.
- DOCS: fixed docs link by @MrChocolatine

### 2.0.0

- BREAKING: see the [upgrade guide to v2](../../docs/upgrade-guide-2.0.md) for the complete list of breaking changes in 2.0 with explanations and instructions.
- BREAKING: webpack 5 upgrade by @gabrielcsapo and @ef4
- BREAKING ENHANCEMENT: support embroider v2-formatted addons
- BREAKING: drop support for babel 6
- BREAKING: inject entry chunks directly into HTML
- BREAKING: addons that use ember-auto-import 2.0 require that the app also has ember-auto-import 2.0.
- BREAKING: apps must depend directly on webpack 5
- BREAKING: change our `alias` option to more closely match webpack by doing a prefix match by default.
- BUGFIX: fix compatibility with babel 7.26+ by @rwjblue
- ENHANCEMENT: support auto-importing dependencies via `@embroider/macros` `importSync` by @simonihmig
- BUGFIX: fix accidental duplication of webpack config
- BREAKING: minimum supported Node is 12 (because 10 hit EOL on 2021-04-30)
- BREAKING: minimum supported Ember and EmberCLI versions are both 3.4

### 1.12.2

- BUGFIX allow the user's devTool setting to take priority over the default provided by forbidEval by @apellerano-pw.

### 1.12.1

- COMPAT upgraded to `@embroider/shared-internals` 1.0 so that apps can avoid redundant copies

### 1.12.0

- FEATURE: We now properly optimize TypeScript's `import type` syntax, meaning
  if you only import the types from a package it will not be included in your
  build.
  Backports [#380](https://github.com/ef4/ember-auto-import/pull/380) from
  `v2.1.0` by @buschtoens.

### 1.11.3

- NO-OP: I accidentally published 2.0.0-alpha.0 to NPM under the `latest` tag. This is a re-published of 1.11.2 to supplant that as latest.

### 1.11.2

- BUGFIX: the new prefix matching implementation of `alias` turned out to be a breaking change, so we're rolling it back in order to make it opt-in.

### 1.11.1

- BUGFIX: as part of the `watchDependencies` feature we changed webpack splitChunksPlugin config in a way that broke in apps with common lazy chunks.

### 1.11.0

- HOUSEKEEPING: major test infrastructure refactor by @ef4 & @mattmcmanus
- COMPAT: ensure babel compilation ignores a babel.config.js by @rwjblue
- ENHANCEMENT: introduce `watchDependencies` option
- ENHANCEMENT: allow unambiguous data URIs
- ENHANCEMENT: make `alias` option support prefix matching by @buschtoens
- BUGFIX: update test-support regex to work with scoped packages by @paddyobrien

### 1.10.1

- BUGFIX: the previous release accidentally leaked code to browsers that was not IE11-safe.

### 1.10.0

- ENHANCEMENT: we are now compatible with the Embroider package spec's handling of `import()`. Template string literals are allowed so long as they point unambiguously to modules within a specific package, or are unambiguously a URL.
- BUGFIX: the test-support tree detection feature in 1.9.0 didn't actually match ember-cli's naming scheme, by @rwjblue.

### 1.9.0

- ENHANCEMENT: use new API from ember-cli to reliably detect which trees are test-support only, even when addons override the default naming scheme by @rwjblue
- ENHANCEMENT: switch to resolve-package-path for better shared caching with the rest of ember-cli by @rwjblue

### 1.8.0

- ENHANCEMENT: improved leader election protocol between copies of ember-auto-import that ensures the newest one is always in charge.
- HOUSEKEEPING: upgrades to typescript and some other deps to get better upstream types

### 1.7.0

- DOCS: improvement to CONTRIBUTING.md by kiwiupover
- BUGFIX: fix merging of webpack configs by @bendemboski
- HOUSEKEEPING: upgrade ember-cli-babel by nlfurniss
- HOUSEKEEPING: upgrade @embroider/core dep by simonihmig
- HOUSEKEEPING: upgrade webpack

### 1.6.0

- ENHANCEMENT: add .ts extension to the resolver allowing import of TypeScript modules without having to add the .ts extension by @buschtoens
- DOCS: document `skipBabel` option by @kasunvp
- DOCS: fix typo in README.md by @jacobq
- DOCS: add instructions for using dynamic imports in addons by @jrjohnson
- ENHANCEMENT: only output files for fastboot when ember-cli-fastboot is detected (can also be manually disabled with FASTBOOT_DISABLED=true environment variable) by @houfeng0923
- HOUSEKEEPING: update CI node version to 12.x by @f1sherman
- ENHANCEMENT: add [id] to the chunkname by @stukalin
- BUGFIX: ensure auto-import processes the same extensions as ember-cli-babel by @dfreeman
- BUGFIX: update minimum version of @babel/preset-env to 7.10.2 by @rwjblue

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
