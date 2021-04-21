import { PreparedApp } from 'scenario-tester';
import { join } from 'path';
import resolve from 'resolve';

export async function setupFastboot(app: PreparedApp, environment = 'development') {
  let result = await app.execute(`node node_modules/ember-cli/bin/ember build --environment=${environment}`);
  if (result.exitCode !== 0) {
    throw new Error(`failed to build app for fastboot: ${result.output}`);
  }
  return await launchFastboot(app.dir);
}

export async function launchFastboot(dir: string) {
  let logs: any[] = [];

  const FastBoot = require(resolve.sync('fastboot', { basedir: resolve.sync('ember-cli-fastboot', { basedir: dir }) }));
  let fastboot = new FastBoot({
    distPath: join(dir, 'dist'),
    resilient: false,
    buildSandboxGlobals(defaultGlobals: any) {
      return Object.assign({}, defaultGlobals, {
        console: {
          log(...args: any[]) {
            logs.push(args);
          },
          warn(...args: any[]) {
            logs.push(args);
          },
        },
      });
    },
  });
  async function visit(url: string) {
    const jsdom = require('jsdom');
    const { JSDOM } = jsdom;
    let page = await fastboot.visit(url);
    let html = await page.html();
    return new JSDOM(html);
  }

  function dumpLogs() {
    for (let log of logs) {
      console.log(...log);
    }
  }

  return { visit, dumpLogs };
}
