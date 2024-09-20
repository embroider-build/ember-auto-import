import isSubdir from 'is-subdir';
import { dirname } from 'path';
import { getPackageEntryPointsSync } from 'pkg-entry-points';

// copied from pkg-entry-points, as we cannot use their types, see comment above
type ConditionToPath = [conditions: string[], internalPath: string];
type PackageEntryPoints = {
  [subpath: string]: ConditionToPath[];
};

/**
 * Given a list of files, it will return the smallest set of directories that contain all these files
 */
export function commonAncestorDirectories(dirs: string[]): string[] {
  return dirs.reduce((results, fileOrDir) => {
    let dir = dirname(fileOrDir);

    if (results.length === 0) {
      return [dir];
    }

    let newResults = results.filter(
      (existingDir) => !isSubdir(dir, existingDir)
    );

    if (!newResults.some((existingDir) => isSubdir(existingDir, dir))) {
      newResults.push(dir);
    }

    return newResults;
  }, [] as string[]);
}

/**
 * Given a path to a package, it will return all its internal(!) module files that are importable,
 * taking into account explicit package.json exports, filtered down to only include importable runtime code
 */
export function getImportableModules(packagePath: string): string[] {
  const entryPoints: PackageEntryPoints =
    getPackageEntryPointsSync(packagePath);

  return Object.values(entryPoints)
    .map(
      (alternatives) =>
        alternatives.find(
          ([conditions]) =>
            (conditions.includes('import') || conditions.includes('default')) &&
            !conditions.includes('types') &&
            !conditions.includes('require') &&
            !conditions.includes('node')
        )?.[1]
    )
    .filter((item): item is string => !!item)
    .filter((item, index, array) => array.indexOf(item) === index);
}

/**
 * Given a package path, it will return the list smallest set of directories that contain importable code.
 * This can be used to constrain the set of directories used for file watching, to not include the whole package directory.
 */
export function getWatchedDirectories(packagePath: string): string[] {
  const modules = getImportableModules(packagePath).filter(
    (module) =>
      // this is a workaround for excluding the addon-main.cjs module commonly used in v2 addons, which is _not_ importable in runtime code,
      // but the generic logic based on (conditional) exports does not exclude that out of the box.
      !module.match(/\/addon-main.c?js$/)
  );
  return commonAncestorDirectories(modules);
}
