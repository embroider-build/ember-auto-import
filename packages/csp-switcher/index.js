/* eslint-env node */
'use strict';

module.exports = {
  name: 'csp-switcher',

  isDevelopingAddon() {
    return true;
  },

  contentFor(which) {
    if (which === 'head' && process.env.CUSTOMIZE_CSP) {
      return `<meta http-equiv="Content-Security-Policy" content="default-src 'self';"></meta>`
    }
  }
};

