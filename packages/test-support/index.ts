import { Project } from 'fixturify-project';
import { setGracefulCleanup } from 'tmp';
import { spawn } from 'child_process';

setGracefulCleanup();

type ProjectMutator = (project: Project) => void | Promise<void>;

export { Project };

type State =
  | {
      type: 'root';
      root: () => Project | Promise<Project>;
    }
  | {
      type: 'derived';
      parent: Scenarios;
      variants: Record<string, ProjectMutator[]>;
    };

export class Scenarios {
  static fromDir(appPath: string): Scenarios {
    return new this({
      type: 'root',
      root: () => Project.fromDir(appPath, { linkDeps: true }),
    });
  }

  static fromProject(fn: () => Promise<Project> | Project): Scenarios {
    return new this({
      type: 'root',
      root: fn,
    });
  }

  expand(variants: Record<string, ProjectMutator>): Scenarios {
    return new Scenarios({
      type: 'derived',
      parent: this,
      variants: Object.fromEntries(Object.entries(variants).map(([variantName, mutator]) => [variantName, [mutator]])),
    });
  }

  map(name: string, fn: ProjectMutator): Scenarios {
    if (this.state.type === 'root') {
      return new Scenarios({
        type: 'derived',
        parent: this,
        variants: {
          [name]: [fn],
        },
      });
    } else {
      return new Scenarios({
        type: 'derived',
        parent: this.state.parent,
        variants: Object.fromEntries(
          Object.entries(this.state.variants).map(([variantName, mutators]) => [
            `${variantName}-${name}`,
            [...mutators, fn],
          ])
        ),
      });
    }
  }

  private iterate(
    fn: (args: { name: string | undefined; root: () => Project | Promise<Project>; mutators: ProjectMutator[] }) => void
  ): void {
    if (this.state.type === 'root') {
      fn({ name: undefined, root: this.state.root, mutators: [] });
    } else {
      let state = this.state;
      this.state.parent.iterate(parent => {
        for (let [variantName, mutators] of Object.entries(state.variants)) {
          let combinedName = parent.name ? `${parent.name}-${variantName}` : variantName;
          fn({ name: combinedName, root: parent.root, mutators: [...parent.mutators, ...mutators] });
        }
      });
    }
  }

  forEachScenario(fn: (appDefinition: Scenario) => void): void {
    this.iterate(({ name, root, mutators }) => {
      fn(new Scenario(name ?? '<root>', root, mutators));
    });
  }

  private constructor(private state: State) {}
}

export const seenScenarios: Scenario[] = [];

export class Scenario {
  constructor(
    public name: string,
    private getBaseScenario: () => Project | Promise<Project>,
    private mutators: ProjectMutator[]
  ) {
    seenScenarios.push(this);
  }

  async prepare(outdir?: string): Promise<PreparedApp> {
    let project = await this.getBaseScenario();
    for (let fn of this.mutators) {
      await fn(project);
    }

    if (outdir) {
      project.baseDir = outdir;
    }
    project.writeSync();
    return new PreparedApp(project.baseDir);
  }
}

export class PreparedApp {
  constructor(public dir: string) {}
  async execute(
    shellCommand: string,
    opts?: { env?: Record<string, string> }
  ): Promise<{ exitCode: number; stderr: string; stdout: string; output: string }> {
    let env: Record<string, string> | undefined;
    if (opts?.env) {
      env = Object.assign({}, process.env, opts.env);
    }
    let child = spawn(shellCommand, { stdio: ['inherit', 'pipe', 'pipe'], cwd: this.dir, shell: true, env });
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
