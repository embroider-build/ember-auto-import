#!/bin/bash

# sample-conflict is supposed to have an extra copy of inner-lib with a different version number
mkdir -p ./node_modules
rm -rf ./node_modules/inner-lib
cp -r ../../packages/inner-lib ./node_modules/inner-lib
node ../../scripts/change-package-version.js ./node_modules/inner-lib/package.json '4.3.2'

node ../../scripts/change-dep-version.js ./package.json inner-lib "4.3.2"

output=`ember build 2>&1`
code=$?

own_status=0

if [[ "$output" =~ "sample-addon and sample-conflict are using different versions of inner-lib" ]]
then
    echo "OK message"
else
    echo "Failed message: $output"
    own_status=1
fi

if [[ "$code" != "0" ]]; then
    echo "OK status code"
else
    echo "Failed status code: $code"
    own_status=1
fi

exit $own_status


