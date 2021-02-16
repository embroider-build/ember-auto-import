/* eslint-env node */
const fs = require('fs');

const filename = process.argv[2];
const target = process.argv[3];
const newVersion = process.argv[4];

let pkg = JSON.parse(fs.readFileSync(filename), 'utf8');
if (pkg.dependencies && pkg.dependencies[target]) {
  pkg.dependencies[target] = newVersion;
}
if (pkg.devDependencies && pkg.devDependencies[target]) {
  pkg.devDependencies[target] = newVersion;
}

fs.unlinkSync(filename);
fs.writeFileSync(filename, JSON.stringify(pkg, null, 2), 'utf8');
