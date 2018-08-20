#!/bin/bash
set -e
case "$EAI_SCENARIO" in
    "2.18")
        yarn add --dev ember-cli@~2.18.0
        ;;
    "stable")
        yarn add --dev ember-cli@latest
        ;;
    "beta")
        yarn add --dev ember-cli@beta
        ;;
    "canary")
        yarn add --dev ember-cli@git+https://github.com/ember-cli/ember-cli#master
        ;;
    *)
        yarn
        ;;
esac

