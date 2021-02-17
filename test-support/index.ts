import Project from 'fixturify-project';
import QUnit from 'qunit';
import { dirSync, setGracefulCleanup } from 'tmp';
import { spawn } from 'child_process';
import { join } from 'path';

setGracefulCleanup();

class TestApp {
  constructor(public dir: string) {}
  async execute(cmd: string): Promise<{ exitCode: number }> {
    let child = spawn(`yarn`, [cmd], { stdio: ['inherit', 'inherit', 'inherit'], cwd: this.dir });
    return new Promise(resolve => {
      child.on('close', (exitCode: number) => {
        resolve({ exitCode });
      });
    });
  }
}

interface TestAppHooks {
  setup(fn: (app: Project) => Promise<void>): void;
  test(name: string, fn: (assert: Assert, app: TestApp) => Promise<void>): void;
}

export interface AppDefinition {
  (hooks: TestAppHooks): void;
}

const scenarios: { name: string; fn: (project: Project) => Promise<void> }[] = [];

export function defineScenario(name: string, fn: (project: Project) => Promise<void>) {
  scenarios.push({ name, fn });
}

export function testApp(name: string, templateApp: string, appDefinition: AppDefinition) {
  if (scenarios.length === 0) {
    throw new Error(`no testApp scenarios defined`);
  }
  for (let scenario of scenarios) {
    QUnit.module(`${scenario.name} - ${name}`, function (hooks) {
      let app: TestApp;
      let project: Project;

      hooks.before(async function () {
        project = Project.fromDir(templateApp, { linkDeps: true });
        await scenario.fn(project);
      });

      appDefinition({
        setup(fn) {
          hooks.before(async function () {
            await fn(project);
          });
        },
        test(name, fn) {
          QUnit.test(name, async function (assert) {
            await fn(assert, app);
          });
        },
      });

      hooks.before(async function () {
        let outdir = dirSync().name;
        await project.writeSync(outdir);
        app = new TestApp(join(outdir, project.name));
      });
    });
  }
}
