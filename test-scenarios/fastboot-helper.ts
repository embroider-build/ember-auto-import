import { PreparedApp } from 'scenario-tester';
import { join } from 'path';

export async function setupFastboot(app: PreparedApp, environment = 'development') {
  let result = await app.execute(`node node_modules/ember-cli/bin/ember build --environment=${environment}`);
  if (result.exitCode !== 0) {
    throw new Error(`failed to build app for fastboot: ${result.output}`);
  }

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
