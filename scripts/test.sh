#!/bin/bash

./scripts/parallel --tag <<EOF
cd test-apps/sample-direct   && yarn test
cd test-apps/sample-direct   && yarn test:fastboot
cd test-apps/sample-direct   && yarn test:prod
cd test-apps/sample-direct   && yarn test:custom-bundles
cd test-apps/sample-indirect && yarn test
cd test-apps/sample-indirect && yarn test:fastboot
cd test-apps/sample-addon    && yarn test
cd test-apps/sample-failure  && yarn test
cd test-apps/sample-merged   && yarn test
cd test-apps/sample-conflict && yarn test
cd test-apps/sample-noconflict && yarn test
yarn test:root
EOF
