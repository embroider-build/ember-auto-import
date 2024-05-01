import isSubdir from 'is-subdir';
import { dirname } from 'path';
// @ts-expect-error types don't resolve as this package exposes them only via package.json exports, which our old TS version does not support
import { getPackageEntryPoints } from 'pkg-entry-points';

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
export async function getImportableModules(
  packagePath: string
): Promise<string[]> {
  const entryPoints: PackageEntryPoints = await getPackageEntryPoints(
    packagePath
  );

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
export async function getWatchedDirectories(
  packagePath: string
): Promise<string[]> {
  const modules = (await getImportableModules(packagePath)).filter((module) =>
    // this is a workaround for excluding the addon-main.cjs module commonly used in v2 addons, which is _not_ importable in runtime code,
    // but the generic logic based on (conditional) exports does not exclude that out of the box.
    module.match(/\/addon-main.c?js$/)
  );
  return commonAncestorDirectories(modules);
}
