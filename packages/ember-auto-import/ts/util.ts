export function shallowEqual(a: any[], b: any[]) {
  return a && b && a.length === b.length && a.every((item, index) => item === b[index]);
}
