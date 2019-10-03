#!/bin/bash

./scripts/link-them.sh

./scripts/parallel --tag  --jobs 1 <<EOF
cd packages/sample-direct      && yarn test
cd packages/sample-direct      && yarn test:fastboot
cd packages/sample-direct      && yarn test:prod
cd packages/sample-direct      && yarn test:custom-bundles
cd packages/sample-direct      && yarn test:custom-bundles-top
cd packages/sample-direct      && yarn test:custom-bundles-fastboot
cd packages/sample-direct      && yarn test:custom-csp
cd packages/sample-indirect    && yarn test
cd packages/sample-indirect    && yarn test:fastboot
cd packages/sample-indirect    && yarn test:custom-csp
cd packages/sample-addon       && yarn test
cd packages/sample-failure     && yarn test
cd packages/sample-merged      && yarn test
cd packages/sample-conflict    && yarn test
cd packages/sample-babel7      && yarn test
cd packages/sample-typescript2 && yarn test
cd packages/sample-noconflict  && yarn test
cd packages/sample-noparse     && yarn test
cd packages/ember-auto-import  && yarn test
cd packages/sample-es-latest   && yarn test
cd packages/sample-skip-babel  && yarn test
cd packages/ember-auto-import  && yarn test:node
EOF
