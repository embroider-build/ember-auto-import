#!/bin/bash

output=`ember build 2>&1`
code=$?

own_status=0

if [[ "$output" =~ "sample-failure tried to import \"moment\" from addon code, but \"moment\" is a devDependency" ]]
then
    echo "OK message"
else
    echo "Failed message"
    own_status=1
fi

if [[ "$code" != "0" ]]; then
    echo "OK status code"
else
    echo "Failed status code"
    own_status=1
fi

exit $own_status
   
   
