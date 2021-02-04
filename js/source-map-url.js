"use strict";
/*
  Adapted from https://github.com/lydell/source-map-url
  Which carries the licensing:
    Copyright 2014 Simon Lydell
    X11 (“MIT”) Licensed.

  Forked here because that one doesn't anchor to the end of the file, and that's pretty important for us.
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertBefore = void 0;
const innerRegex = /[#@] sourceMappingURL=([^\s'"]*)/;
const regex = RegExp('(?:' +
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
    '\\s*$');
function insertBefore(code, string) {
    let match = code.match(regex);
    if (match) {
        return code.slice(0, match.index) + string + code.slice(match.index);
    }
    else {
        return code + string;
    }
}
exports.insertBefore = insertBefore;
//# sourceMappingURL=source-map-url.js.map