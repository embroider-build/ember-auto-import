#!/bin/bash

mkdir -p ./test-apps/sample-direct/node_modules
ln -s ../../.. ./test-apps/sample-direct/node_modules/ember-auto-import
ln -s ../../../node_modules/.bin ./test-apps/sample-direct/node_modules/.bin
