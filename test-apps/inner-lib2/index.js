/* eslint-env node */

const named = require('./named');

module.exports = function() {
  named();
  return 'innerlib2 loaded';
}
