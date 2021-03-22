import { PreparedApp } from '@ef4/test-support';
import { join } from 'path';

export async function setupFastboot(app: PreparedApp) {
  await app.execute(`node node_modules/ember-cli/bin/ember build`);
  const FastBoot = require('fastboot');
  let fastboot = new FastBoot({
    distPath: join(app.dir, 'dist'),
    resilient: false,
  });
  async function visit(url: string) {
    const jsdom = require('jsdom');
    const { JSDOM } = jsdom;
    let page = await fastboot.visit(url);
    let html = await page.html();
    return new JSDOM(html);
  }
  return { visit };
}
