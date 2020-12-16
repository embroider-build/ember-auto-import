/* eslint-env node */
'use strict';

module.exports = {
  name: 'bundle-switcher',

  isDevelopingAddon() {
    return true;
  },

  contentFor(which) {
    if (which === 'body') {
      return `<script src="${vendorPath()}"></script>`;
    }
  },
};

function vendorPath() {
  if (process.env.CUSTOMIZE_BUNDLES) {
    return process.env.CUSTOMIZE_BUNDLES;
  } else {
    return `/assets/vendor.js`;
  }
}
