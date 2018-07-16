/* eslint-env node */
const fs = require('fs');

const filename = process.argv[2];
const newVersion = process.argv[3];

let pkg = JSON.parse(fs.readFileSync(filename), 'utf8');
pkg.version = newVersion;

fs.writeFileSync(filename, JSON.stringify(pkg, null, 2), 'utf8');

