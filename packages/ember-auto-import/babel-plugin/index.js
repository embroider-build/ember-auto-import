const template  = require('babel-template');
const syntax = require('babel-plugin-syntax-dynamic-import');
const buildImport = template(`emberAutoImportDynamic(SOURCE)`);

module.exports = () => ({
  inherits: syntax,
  visitor: {
    Import(path) {
      const newImport = buildImport({
        SOURCE: path.parentPath.node.arguments,
      });
      path.parentPath.replaceWith(newImport);
    },
  },
});

module.exports.baseDir = function() {
  return __dirname;
};

