import Project from 'fixturify-project';
import { dirSync, setGracefulCleanup } from 'tmp';
import { spawn } from 'child_process';
import { join } from 'path';
import { renameSync, unlinkSync } from 'fs-extra';

setGracefulCleanup();

type ProjectMutator = (project: Project) => void | Promise<void>;

export { Project };

export class Scenarios {
  static fromDir(appPath: string): Scenarios {
    return new this(() => Project.fromDir(appPath, { linkDeps: true }), []);
  }

  static fromProject(fn: () => Promise<Project> | Project): Scenarios {
    return new this(fn, []);
  }

  add(name: string, fn: ProjectMutator): Scenarios {
    return new Scenarios(this.getBaseScenario, [...this.variants, { name, fns: [fn] }]);
  }

  map(name: string, fn: ProjectMutator): Scenarios {
    return new Scenarios(
      this.getBaseScenario,
      this.variants.map(v => ({
        name: `${v.name}-${name}`,
        fns: [...v.fns, fn],
      }))
    );
  }

  forEachScenario(fn: (appDefinition: Scenario) => void): void {
    for (let variant of this.variants) {
      fn(new Scenario(variant.name, this.getBaseScenario, variant.fns));
    }
  }

  private constructor(
    private getBaseScenario: () => Project | Promise<Project>,
    private variants: { name: string; fns: ProjectMutator[] }[]
  ) {}
}

export class Scenario {
  constructor(
    public name: string,
    private getBaseScenario: () => Project | Promise<Project>,
    private mutators: ProjectMutator[]
  ) {}

  async prepare(outdir?: string): Promise<PreparedApp> {
    let project = await this.getBaseScenario();
    for (let fn of this.mutators) {
      await fn(project);
    }

    let dir: string;
    if (outdir) {
      // fixturify-project always writes the actual project in a subdir with
      // the project name. We want the project directly inside outdir. So we
      // do a little dance with a temporary name.
      project.writeSync(outdir + '--tmp');
      renameSync(join(outdir + '--tmp', project.name), outdir);
      unlinkSync(outdir + '--tmp');
      dir = outdir;
    } else {
      let parent = dirSync().name;
      project.writeSync(parent);
      dir = join(parent, project.name);
    }
    return new PreparedApp(dir);
  }
}

export class PreparedApp {
  constructor(public dir: string) {}
  async execute(shellCommand: string): Promise<{ exitCode: number; stderr: string; stdout: string; output: string }> {
    let child = spawn(shellCommand, { stdio: ['inherit', 'pipe', 'pipe'], cwd: this.dir, shell: true });
    let stderrBuffer: string[] = [];
    let stdoutBuffer: string[] = [];
    let combinedBuffer: string[] = [];
    child.stderr.on('data', data => {
      stderrBuffer.push(data);
      combinedBuffer.push(data);
    });
    child.stdout.on('data', data => {
      stdoutBuffer.push(data);
      combinedBuffer.push(data);
    });
    return new Promise(resolve => {
      child.on('close', (exitCode: number) => {
        resolve({
          exitCode,
          get stdout() {
            return stdoutBuffer.join('');
          },
          get stderr() {
            return stderrBuffer.join('');
          },
          get output() {
            return combinedBuffer.join('');
          },
        });
      });
    });
  }
}
