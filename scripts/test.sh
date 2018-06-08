#!/bin/bash

parallel --tag <<EOF
cd test-apps/sample-direct   && yarn test
cd test-apps/sample-direct   && yarn test:fastboot
cd test-apps/sample-indirect && yarn test
cd test-apps/sample-addon    && yarn test
cd test-apps/sample-dummy    && yarn test
yarn test:root
yarn lint:js
EOF
