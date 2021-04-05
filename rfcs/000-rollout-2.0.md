# Planning ember-auto-import 2.0

We're ready to ship addons in v2 format. In embroider, v2 addons Just Work and are faster to build than v1 addons. In non-embroider builds:

- the addon uses `v1AddonShim` from `@embroider/util` to present a v1-compatibility interface to ember-cli
- the shim takes care of features like `app-js` and `public-assets`
- ember-auto-import takes care of incorporating the addon's own module namespace into the build
- the shim needs to assert that the app has a new-enough ember-auto-import that supports all the v2 addon features (like inline templates and ember-modules-api-polyfill)

Because the consuming package needs a new-enough ember-auto-import, it is generally a breaking change for an addon to ship as v2, and we're going to suggest most addon authors release semver majors when they switch. It's easier to understand that way, and it means they can truly use v2 addon features in their code (like `await import()` , including of their own code).

However, with care it would be possible to ship an addon opportunistically as v2 without a breaking change, and this is what I'd like to propose for ember-source, so we don't need to wait for 4.0. The strategy would be to keep today's implementation (putting ember into vendor.js via `app.import`) when we see you don't have the required ember-auto-import, and only delegating to the shim if you have the new-enough ember-auto-import. The main caveat with this approach is that the code in ember-source cannot use v2-addon features (like `await import()`) because it won't always really be running as a v2 addon.

At 4.0 we would make ember-auto-import a required peerDep and ship ember-source only as v2.

There are two complications in this plan:

- ember-auto-import has a leader election strategy, because only one copy can really build the app, even though it may be a dependency of many different addons at different versions.
- the new v2 addon support in ember-auto-import is a breaking change for some apps.

Those facts together mean we need to take care in rolling out these changes.

## ember-auto-import 2.0

Since v2 addons can import CSS as described in the embroider rfc, we added CSS handling to ember-auto-import. But some apps already configure their own CSS handling directly in the webpack config and will get an error due to double transpilation when they upgrade ember-auto-import. This means we should do a semver major release of ember-auto-import (2.0).

There are several other things that have been waiting on a semver major. This complete list is:

### Webpack 5

This is a potentially breaking change for any package that directly adds to webpack config. Most apps will not experience any breakage, because most common webpack 4 configs still work in webpack 5.

### Embroider v2 addon support

Potentially breaking because it adds more stuff to the webpack config that people could have been manually controlling before. Specifically:

- v2 addons are allowed to import css, so we add the appropriate webpack loaders
- v2 addons are allowed to contain inline templates, decorators, and embroider macros, so all of these are now supported by ember-auto-import

### Drop babel 6

Today we always ship a complete copy of babel 6 in order to parse any apps or addons that are using babel 6 (because we need to be able to install their syntax plugins in order to parse their code without errors). I would like to drop all that to reduce the node_modules weight.

You can still have addons using babel 6, but those addons can't use ember-auto-import 2.0.

### inject entry chunks directly in index.html

Today entry chunks are appended to vendor.js (and vendor.css if you manually added some webpack config that emits css). This is bad because it interacts badly with ember-cli's source mapping, it's more expensive in the build, it defeats some caching, and it's more complicated to get right. It also requires us to monkey-patch ember-cli, and it leads to a painful bug if the parent package of the chosen leader never calls `super` include `included`.

2.0 will insert script (and link) tags directly into index.html instead. This is better for all the reasons above, the only downside is that the presence of these new files in dist may impact people with unnecessarily specific deployment code that, instead of deploying `dist/*` like they should, deploys only `dist/app.js`, `dist/vendor.js`, etc, without noticing the new `dist/chunk*.{js,css}` we emitted. This is _already_ a problem for them if any code uses dynamic imports, because we will emit lazy chunks today. But it would get more acute once we do it for even eager chunks.

### Mandatory top-level auto-import

When used by an addon, ember-auto-import 2.0 will assert that the top-level app package has ember-auto-import >= 2.0.

There are too many top-level concerns governed by auto-import to sneak it in via addons, without the app having any control over the version range. Also, it is effectively a polyfill for part of embroider, so pushing apps that don't yet have it to make it work pushes them toward embroider compatibility as well.

We will still perform leader election, but only copies that are semver compatible with the app will be eligible to lead. This allows addons to rely on new features in minor releases of ember-auto-import.

## Addon compatibility checking

After choosing leader, we will check each package to see if it is expected to work. Expected to work is more subtle than just semver compatibility.

- if the addon needs v2 addon support but the chosen version doesn't have it, that's an error (shipping a v2 addon is a semver-breaking change because your users are required to add ember-auto-import 2.0)
- if the addon has custom webpack config and is

## Addon compatibility override

We will add an option to ember-auto-import to ignore the addon compatibility errors:

```js
{
  autoImport: {
    unsafeAddonCompatibility: ['some-addon-name'];
  }
}
```

You can also override which webpack version we will use to pick custom config out of the addon:

```js
{
  autoImport: {
    unsafeAddonCompatibility: [{ addon: 'some-addon-name', useConfigForWebpack: '4' }];
  }
}
```
