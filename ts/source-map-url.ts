/*
  Adapted from https://github.com/lydell/source-map-url
  Which carries the licensing:
    Copyright 2014 Simon Lydell
    X11 (“MIT”) Licensed.

  Forked here because that one doesn't anchor to the end of the file, and that's pretty important for us.
*/

const innerRegex = /[#@] sourceMappingURL=([^\s'"]*)/;
const regex = RegExp(
  '(?:' +
    '/\\*' +
    '(?:\\s*\r?\n(?://)?)?' +
    '(?:' +
    innerRegex.source +
    ')' +
    '\\s*' +
    '\\*/' +
    '|' +
    '//(?:' +
    innerRegex.source +
    ')' +
    ')' +
    '\\s*$'
);

export function insertBefore(code: string, string: string) {
  let match = code.match(regex);
  if (match) {
    return code.slice(0, match.index) + string + code.slice(match.index);
  } else {
    return code + string;
  }
}
