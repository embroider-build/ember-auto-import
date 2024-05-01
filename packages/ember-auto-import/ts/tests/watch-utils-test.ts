import QUnit from 'qunit';
import 'qunit-assertions-extra';
import {
  commonAncestorDirectories,
  getImportableModules,
  getWatchedDirectories,
} from '../watch-utils';
import { Project } from 'scenario-tester';

const { module: Qmodule, test } = QUnit;

async function generateProject(packageJson = {}, additionalFiles = {}) {
  const project = new Project('my-package', {
    files: {
      'package.json': JSON.stringify(packageJson),
      src: {
        'index.js': 'export default 123',
        'module.js': 'export default 123',
        nested: {
          'module.js': 'export default 123',
        },
      },
      dist: {
        'index.js': 'export default 123',
        'module.js': 'export default 123',
        nested: {
          'module.js': 'export default 123',
        },
      },
      declarations: {
        'index.d.ts': 'export default 123',
        'module.d.ts': 'export default 123',
        nested: {
          'module.d.ts': 'export default 123',
        },
      },
      lib: {
        'module.js': 'export default 123',
      },
      ...additionalFiles,
    },
  });

  await project.write();

  return project;
}

Qmodule('commonAncestorDirectories', function () {
  test('returns same dirs if no nested', function (assert) {
    const result = commonAncestorDirectories([
      '/a/b/c/index.js',
      '/d/index.js',
    ]);

    assert.deepEqual(result, ['/a/b/c', '/d']);
  });

  test('returns common dirs', function (assert) {
    const result = commonAncestorDirectories([
      '/a/b/c/index.js',
      '/a/b/index.js',
      '/d/index.js',
      '/d/e/f/index.js',
    ]);

    assert.deepEqual(result, ['/a/b', '/d']);
  });

  test('ignores duplicates', function (assert) {
    const result = commonAncestorDirectories([
      '/a/b/c/index.js',
      '/a/b/index.js',
      '/a/b/c/index.js',
      '/a/b/index.js',
    ]);

    assert.deepEqual(result, ['/a/b']);
  });
});

Qmodule('importableModules', function (hooks) {
  let project: Project;

  hooks.afterEach(function (this: any) {
    project?.dispose();
  });

  test('returns only modules declared in exports', async function (assert) {
    project = await generateProject({
      exports: './dist/index.js',
    });

    const result = await getImportableModules(project.baseDir);

    assert.deepEqual(result, ['./dist/index.js']);
  });

  test('ignores types condition', async function (assert) {
    project = await generateProject({
      exports: {
        '.': {
          types: './declarations/index.d.ts',
          default: './dist/index.js',
        },
      },
    });

    const result = await getImportableModules(project.baseDir);

    assert.deepEqual(result, ['./dist/index.js']);
  });

  test('ignores node condition', async function (assert) {
    project = await generateProject({
      exports: {
        '.': {
          types: './declarations/index.d.ts',
          default: './dist/index.js',
        },
        'lib/module': {
          node: './lib/module.js',
        },
      },
    });

    const result = await getImportableModules(project.baseDir);

    assert.deepEqual(result, ['./dist/index.js']);
  });

  test('supports import condition', async function (assert) {
    project = await generateProject({
      exports: {
        '.': {
          types: './declarations/index.d.ts',
          import: './dist/index.js',
        },
      },
    });

    const result = await getImportableModules(project.baseDir);

    assert.deepEqual(result, ['./dist/index.js']);
  });

  test('supports nested conditions', async function (assert) {
    project = await generateProject({
      exports: {
        '.': {
          import: {
            types: './declarations/index.d.ts',
            default: './dist/index.js',
          },
        },
      },
    });

    const result = await getImportableModules(project.baseDir);

    assert.deepEqual(result, ['./dist/index.js']);
  });

  test('supports subpaths', async function (assert) {
    project = await generateProject({
      exports: {
        '.': {
          types: './declarations/index.d.ts',
          default: './dist/index.js',
        },
        module: {
          types: './declarations/module.d.ts',
          default: './dist/module.js',
        },
        'nested/module': {
          types: './declarations/nested/module.d.ts',
          default: './dist/nested/module.js',
        },
      },
    });

    const result = await getImportableModules(project.baseDir);

    assert.deepEqual(result, [
      './dist/index.js',
      './dist/module.js',
      './dist/nested/module.js',
    ]);
  });

  test('supports globstar patterns', async function (assert) {
    project = await generateProject({
      exports: {
        '.': {
          types: './declarations/index.d.ts',
          default: './dist/index.js',
        },
        './*': {
          types: './declarations/*.d.ts',
          default: './dist/*.js',
        },
      },
    });

    const result = await getImportableModules(project.baseDir);

    assert.deepEqual(result, [
      './dist/index.js',
      './dist/module.js',
      './dist/nested/module.js',
    ]);
  });

  test('returns all possible imports when having only main export', async function (assert) {
    project = await generateProject({
      main: './dist/index.js',
    });

    const result = await getImportableModules(project.baseDir);

    assert.deepEqual(result, [
      './declarations/index.d.ts',
      './declarations/module.d.ts',
      './declarations/nested/module.d.ts',
      './dist/index.js',
      './dist/module.js',
      './dist/nested/module.js',
      './index.js',
      './lib/module.js',
      './package.json',
      './src/index.js',
      './src/module.js',
      './src/nested/module.js',
    ]);
  });
});

Qmodule('getWatchedDirectories', function (hooks) {
  let project: Project;

  hooks.afterEach(function (this: any) {
    project?.dispose();
  });

  test('returns only dist for typical v2 addon', async function (assert) {
    project = await generateProject(
      {
        exports: {
          '.': {
            types: './declarations/index.d.ts',
            default: './dist/index.js',
          },
          './*': {
            types: './declarations/*.d.ts',
            default: './dist/*.js',
          },
          './addon-main.js': './addon-main.cjs',
        },
      },
      {
        'addon-main.cjs': 'module.exports = {}',
      }
    );

    const result = await getWatchedDirectories(project.baseDir);

    assert.deepEqual(result, ['./dist']);
  });
});
