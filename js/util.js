"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shallowEqual = void 0;
function shallowEqual(a, b) {
    return a && b && a.length === b.length && a.every((item, index) => item === b[index]);
}
exports.shallowEqual = shallowEqual;
//# sourceMappingURL=util.js.map