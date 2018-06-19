# Changelog

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
