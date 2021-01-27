import { resolve, dirname, join, basename } from 'path';

import {
  copySync,
  removeSync,
  existsSync,
  readJSONSync,
  outputJSONSync,
  writeFileSync,
  readFileSync,
  ensureSymlinkSync,
} from 'fs-extra';

import { mergeWith, uniq } from 'lodash';

interface PrepareParams {
  outdir: string;
  scenario: string;
}

const monorepo = resolve(__dirname, '..', '..');

export default function prepare(params: PrepareParams) {
  removeSync(params.outdir);

  let scenarioPath = join(monorepo, 'scenarios', params.scenario);
  let scenarioPkg = readJSONSync(join(scenarioPath, 'package.json'));
  let baseName = scenarioPkg['ember-auto-import-test-harness']?.base || 'app-template';
  let basePath = join(monorepo, 'project-templates', baseName);

  // all files get layered
  copySync(basePath, params.outdir, { filter: noNodeModules });
  copySync(scenarioPath, params.outdir, { filter: noNodeModules });

  // package.json gets merged
  let basePkg = readJSONSync(join(basePath, 'package.json'));
  outputJSONSync(resolve(params.outdir, 'package.json'), mergePackageJSONs([basePkg, scenarioPkg]), { spaces: 2 });

  // app name gets adjusted
  for (let file of ['config/environment.js', 'app/index.html', 'tests/index.html']) {
    let path = resolve(params.outdir, file);
    let pattern = new RegExp(`\\b${baseName}\\b`, 'g');
    if (existsSync(path)) {
      writeFileSync(path, readFileSync(path, 'utf8').replace(pattern, params.scenario));
    }
  }

  // specific insertable snippets get inserted
  insertSnippet(params.outdir, scenarioPath, 'ember-cli-build.js', 'ember-app-options.snippet');
  linkDependencies(params.outdir, basePath, scenarioPath, scenarioPkg);
}

function mergePackageJSONs(pkgs: any[]) {
  function appendArraysUniq(objValue: any, srcValue: any) {
    if (Array.isArray(objValue)) {
      return uniq(objValue.concat(srcValue));
    }
  }
  return mergeWith({}, ...pkgs, appendArraysUniq);
}

function insertSnippet(outdir: string, scenarioPath: string, targetFile: string, snippetFile: string) {
  let snippetPath = join(scenarioPath, snippetFile);
  if (existsSync(snippetPath)) {
    let targetPath = resolve(outdir, targetFile);
    writeFileSync(
      targetPath,
      readFileSync(targetPath, 'utf8').replace(`//TARGET:${snippetFile}`, readFileSync(snippetPath, 'utf8'))
    );
  }
}

function linkDependencies(outdir: string, basePath: string, scenarioPath: string, scenarioPkg: any) {
  let pkg = readJSONSync(resolve(outdir, 'package.json'));
  for (let section of ['dependencies', 'devDependencies', 'peerDependencies']) {
    if (pkg[section]) {
      for (let pkgName of Object.keys(pkg[section] as { [name: string]: string })) {
        let basedir: string;
        if (scenarioPkg[section]?.[pkgName]) {
          basedir = scenarioPath;
        } else {
          basedir = basePath;
        }
        let target = dirname(require.resolve(`${pkgName}/package.json`, { paths: [basedir] }));
        if (isScenario(target)) {
          prepare({
            scenario: basename(target),
            // output goes inside node_modules of parent output
            outdir: resolve(outdir, 'node_modules', pkgName),
          });
        } else {
          ensureSymlinkSync(target, resolve(outdir, 'node_modules', pkgName));
        }
      }
    }
  }
  ensureSymlinkSync(join(basePath, 'node_modules', '.bin'), resolve(outdir, 'node_modules', '.bin'));
}

const scenarios = join(monorepo, 'scenarios');
function isScenario(path: string) {
  return path.startsWith(scenarios);
}

function noNodeModules(path: string): boolean {
  return !/node_modules/.test(path);
}
