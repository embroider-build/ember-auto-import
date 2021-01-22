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

interface Params {
  outdir: string;
  base: string;
  scenario: string;
}

module.exports = prepare;
function prepare(params: Params) {
  removeSync(params.outdir);

  // all files get layered
  copySync(params.base, params.outdir);
  copySync(params.scenario, params.outdir);

  // package.json gets merged
  let pkgs = [];
  for (let file of [resolve(params.base, 'package.json'), resolve(params.scenario, 'package.json')]) {
    if (existsSync(file)) {
      pkgs.push(readJSONSync(file));
    }
  }
  outputJSONSync(resolve(params.outdir, 'package.json'), mergePackageJSONs(pkgs), { spaces: 2 });

  // specific insertable snippets get inserted
  insertSnippet(params, 'ember-cli-build.js', 'ember-app-options.snippet');

  linkDependencies(params);
}

function mergePackageJSONs(pkgs: unknown[]) {
  function appendArraysUniq(objValue: any, srcValue: any) {
    if (Array.isArray(objValue)) {
      return uniq(objValue.concat(srcValue));
    }
  }
  return mergeWith({}, ...pkgs, appendArraysUniq);
}

function insertSnippet(argv: Params, targetFile: string, snippetFile: string) {
  let snippetPath = resolve(argv.scenario, snippetFile);
  if (existsSync(snippetPath)) {
    let targetPath = resolve(argv.outdir, targetFile);
    writeFileSync(
      targetPath,
      readFileSync(targetPath, 'utf8').replace(`//TARGET:${snippetFile}`, readFileSync(snippetPath))
    );
  }
}

function linkDependencies(params: Params) {
  let pkg = readJSONSync(resolve(params.outdir, 'package.json'));
  for (let section of ['dependencies', 'devDependencies', 'peerDependencies']) {
    if (pkg[section]) {
      for (let [pkgName, range] of Object.entries(pkg[section] as { [name: string]: string })) {
        if (range.startsWith('@ef4/test-harness:')) {
          let [, base, scenario] = range.split(':');
          prepare({
            // new base is resolved relative to parent base's parent dir
            base: resolve(params.base, '..', base),
            // new scenario is resolved relative to parent scenario's parent dir
            scenario: resolve(params.scenario, '..', scenario),
            // output goes inside node_modules of parent output
            outdir: resolve(params.outdir, 'node_modules', pkgName),
          });
        } else {
          let target = dirname(require.resolve(`${pkgName}/package.json`));
          ensureSymlinkSync(target, resolve(params.outdir, 'node_modules', pkgName));
        }
      }
    }
  }
  ensureSymlinkSync(resolve(__dirname, 'node_modules', '.bin'), resolve(params.outdir, 'node_modules', '.bin'));
}
