const { resolve, dirname } = require('path');
const {
  copySync,
  removeSync,
  existsSync,
  readJSONSync,
  outputJSONSync,
  writeFileSync,
  readFileSync,
  ensureSymlinkSync,
} = require('fs-extra');
const { mergeWith, uniq } = require('lodash');

module.exports = function prepare(argv) {
  removeSync(argv.outdir);

  // all files get layered
  copySync(argv.base, argv.outdir);
  copySync(argv.scenario, argv.outdir);

  // package.json gets merged
  let pkgs = [];
  for (let file of [resolve(argv.base, 'package.json'), resolve(argv.scenario, 'package.json')]) {
    if (existsSync(file)) {
      pkgs.push(readJSONSync(file));
    }
  }
  outputJSONSync(resolve(argv.outdir, 'package.json'), mergePackageJSONs(pkgs), { spaces: 2 });

  // specific insertable snippets get inserted
  insertSnippet(argv, 'ember-cli-build.js', 'ember-app-options.snippet');

  linkDependencies(argv.outdir);
};

function mergePackageJSONs(pkgs) {
  function appendArraysUniq(objValue, srcValue) {
    if (Array.isArray(objValue)) {
      return uniq(objValue.concat(srcValue));
    }
  }
  return mergeWith({}, ...pkgs, appendArraysUniq);
}

function insertSnippet(argv, targetFile, snippetFile) {
  let snippetPath = resolve(argv.scenario, snippetFile);
  if (existsSync(snippetPath)) {
    let targetPath = resolve(argv.outdir, targetFile);
    writeFileSync(
      targetPath,
      readFileSync(targetPath, 'utf8').replace(`//TARGET:${snippetFile}`, readFileSync(snippetPath))
    );
  }
}

function linkDependencies(outdir) {
  let pkg = readJSONSync(resolve(outdir, 'package.json'));
  for (let section of ['dependencies', 'devDependencies', 'peerDependencies']) {
    if (pkg[section]) {
      for (let [pkgName, range] of Object.entries(pkg[section])) {
        if (range.startsWith('@ef4/test-harness:')) {
          // todo: recurse to link up an inner scenario
        } else {
          let target = dirname(require.resolve(`${pkgName}/package.json`));
          ensureSymlinkSync(target, resolve(outdir, 'node_modules', pkgName));
        }
      }
    }
  }
  ensureSymlinkSync(resolve(__dirname, 'node_modules', '.bin'), resolve(outdir, 'node_modules', '.bin'));
}
