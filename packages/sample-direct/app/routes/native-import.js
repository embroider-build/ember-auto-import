import Route from '@ember/routing/route';

export default Route.extend({
  model() {
    if (typeof FastBoot == 'undefined') {
      return import(`//${window.location.host}/my-target.js`);
    } else {
      return { name: 'server' };
    }
  },
});
