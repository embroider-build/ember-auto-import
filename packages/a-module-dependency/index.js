function returnUndefined() {
  // this should throw an error unless it's been transpiled
  return foo;
  let foo = 123;
}

export default function aModuleDependency() {
  try {
    if (returnUndefined() === undefined) {
      return 'module transpiled';
    }
  } catch (e) {
    return 'module not transpiled';
  }
}
