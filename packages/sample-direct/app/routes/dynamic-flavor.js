import Route from '@ember/routing/route';

export default Route.extend({
  model({ which }) {
    return import(`a-dependency/flavors/${which}`);
  }
});
