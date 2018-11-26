#!/bin/bash

set -e

# sample-conflict is supposed to have an extra copy of inner-lib with a different version number
mkdir -p ./packages/sample-conflict/node_modules
rm -rf ./packages/sample-conflict/node_modules/inner-lib
cp -r ./packages/inner-lib ./packages/sample-conflict/node_modules/inner-lib
node ./scripts/change-package-version.js ./packages/sample-conflict/node_modules/inner-lib/package.json '4.3.2'

# sample-noconflict is supposed to have an extra copy of inner-lib (with the same version as the other copy)
mkdir -p ./packages/sample-noconflict/node_modules
rm -rf ./packages/sample-noconflict/node_modules/inner-lib
cp -r ./packages/inner-lib ./packages/sample-noconflict/node_modules/inner-lib
