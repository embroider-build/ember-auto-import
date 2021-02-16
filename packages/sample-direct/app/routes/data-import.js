import Route from '@ember/routing/route';

export default Route.extend({
  model() {
    if (typeof FastBoot == 'undefined') {
      return import(`data:application/javascript;base64,${btoa('export const name = "browser"')}`);
    } else {
      return { name: 'server' };
    }
  },
});
