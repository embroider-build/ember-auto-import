import isSubdir from 'is-subdir';
import { dirname } from 'path';

export function shallowEqual(a: any[], b: any[]) {
  return (
    a &&
    b &&
    a.length === b.length &&
    a.every((item, index) => item === b[index])
  );
}

export function stripQuery(path: string) {
  return path.split('?')[0];
}

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
