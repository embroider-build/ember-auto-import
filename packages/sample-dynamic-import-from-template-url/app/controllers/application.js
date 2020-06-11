import Controller from '@ember/controller';

export default class ApplicationController extends Controller {
  async loadDependency() {
    let module = 'foo.js';
    await import(`https://examples.com/${module}`);
    await import(`http://examples.com/${module}`);
    await import(`//examples.com/${module}`);

    let moduleWithDomain = `examples.com/${module}`;
    await import(`https://${moduleWithDomain}`);
    await import(`http://${moduleWithDomain}`);
    await import(`//${moduleWithDomain}`);
  }
}
