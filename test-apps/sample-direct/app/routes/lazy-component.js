import Route from '@ember/routing/route';
import ENV from 'sample-direct/config/environment';

export default Route.extend({
  model() {
    return import('micro-ember-lib').then(result => {
      result.defineComponents(ENV.modulePrefix);
    });
  }
});
