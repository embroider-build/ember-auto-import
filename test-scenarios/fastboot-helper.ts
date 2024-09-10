import { PreparedApp } from 'scenario-tester';
import { join } from 'path';
import resolve from 'resolve';
import { realpathSync } from 'fs';

export async function setupFastboot(app: PreparedApp, environment = 'development') {
  let result = await app.execute(`volta run ember build --environment=${environment}`);
  if (result.exitCode !== 0) {
    throw new Error(`failed to build app for fastboot: ${result.output}`);
  }
  return await launchFastboot(app.dir);
}

export async function launchFastboot(dir: string) {
  let logs: any[] = [];

  const FastBoot = require(resolve.sync('fastboot', {
    basedir: realpathSync(resolve.sync('ember-cli-fastboot', { basedir: dir })),
  }));

  let sandboxGlobals = {
    console: {
      log(...args: any[]) {
        logs.push(args);
      },
      warn(...args: any[]) {
        logs.push(args);
      },
      debug(...args: any[]) {
        logs.push(args);
      },
      error(...args: any[]) {
        logs.push(args);
      },
    },
  };

  let fastboot = new FastBoot({
    distPath: join(dir, 'dist'),
    resilient: false,

    // we test under multiple fastboot versions, some of which use the older
    // sandboxGlobals and some of which use buildSandboxGlobals and will
    // complain that sandboxGlobals is deprecated
    sandboxGlobals,
    buildSandboxGlobals(defaultGlobals: any) {
      return Object.assign({}, defaultGlobals, sandboxGlobals);
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
