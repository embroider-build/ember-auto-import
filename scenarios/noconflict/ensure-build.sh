#!/bin/bash

# sample-noconflict is supposed to have an extra copy of inner-lib with a compatible version
mkdir -p ./node_modules
rm -rf ./node_modules/inner-lib
cp -r ../../packages/inner-lib ./node_modules/inner-lib

ember build
