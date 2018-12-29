#!/bin/bash
set -e

case "$EAI_SCENARIO" in
    "2.18")
        version="~2.18.0"
        ;;
    "stable")
        version="latest"
        ;;
    "beta")
        version="beta"
        ;;
    "canary")
        version="git+https://github.com/ember-cli/ember-cli#master"
        ;;
esac

if [ -z "$version" ]; then
  yarn;
else

  # add the new ember-cli version to ember-auto-import. This will not get
  # hoisted because the other packages will still have whatever was in
  # yarn.lock.
  pushd packages/ember-auto-import
  yarn add --dev ember-cli@$version
  popd

  # manually hoist
  if [ -d packages/ember-auto-import/node_modules/ember-cli ]; then
    rm -rf node_modules/ember-cli
    ln -s ../packages/ember-auto-import/node_modules/ember-cli node_modules/ember-cli
  fi

fi
