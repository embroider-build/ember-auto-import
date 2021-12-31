import QUnit from 'qunit';
import 'qunit-assertions-extra';
import type AutoImport from '../auto-import';
import { AddonInstance } from '@embroider/shared-internals';
import { LeaderChooser } from '../leader';

const { module: Qmodule, test } = QUnit;

class FakeProject {
  constructor(
    public pkg: { name: string; devDependencies: Record<string, string> }
  ) {}

  fakeAddon(name: string, version = '1.0.0'): AddonInstance & FakeAddon {
    return new FakeAddon(
      name,
      version,
      this,
      this
    ) as unknown as AddonInstance & FakeAddon;
  }
}

class FakeAddon {
  pkg: { version: string };

  constructor(
    public name: string,
    version: string,
    public parent: FakeProject | FakeAddon,
    public project: FakeProject
  ) {
    this.pkg = { version };
  }

  fakeAddon(name: string, version = '1.0.0'): AddonInstance & FakeAddon {
    return new FakeAddon(
      name,
      version,
      this,
      this.project
    ) as unknown as AddonInstance & FakeAddon;
  }
}

Qmodule('leader-chooser', function () {
  test('compatible version registered first can win', function (assert) {
    let project = new FakeProject({
      name: 'sample-app',
      devDependencies: {
        'ember-auto-import': '^2.0.0',
      },
    });
    let appInstance = project.fakeAddon('ember-auto-import', '2.0.0');
    let addonInstance = project
      .fakeAddon('intermediate')
      .fakeAddon('ember-auto-import', '2.0.1');

    LeaderChooser.for(appInstance).register(
      appInstance,
      () => 'app won' as unknown as AutoImport
    );
    LeaderChooser.for(addonInstance).register(
      addonInstance,
      () => 'addon won' as unknown as AutoImport
    );
    assert.equal(LeaderChooser.for(appInstance).leader, 'addon won');
  });

  test('compatible version registered second can win', function (assert) {
    let project = new FakeProject({
      name: 'sample-app',
      devDependencies: {
        'ember-auto-import': '^2.0.0',
      },
    });
    let appInstance = project.fakeAddon('ember-auto-import', '2.0.0');
    let addonInstance = project
      .fakeAddon('intermediate')
      .fakeAddon('ember-auto-import', '2.0.1');

    LeaderChooser.for(addonInstance).register(
      addonInstance,
      () => 'addon won' as unknown as AutoImport
    );
    LeaderChooser.for(appInstance).register(
      appInstance,
      () => 'app won' as unknown as AutoImport
    );
    assert.equal(LeaderChooser.for(appInstance).leader, 'addon won');
  });

  test('1.x version in app is an error', function (assert) {
    let project = new FakeProject({
      name: 'sample-app',
      devDependencies: {
        'ember-auto-import': '^2.0.0',
      },
    });
    let appInstance = project.fakeAddon('ember-auto-import', '1.0.0');
    let addonInstance = project
      .fakeAddon('intermediate')
      .fakeAddon('ember-auto-import', '2.0.1');

    LeaderChooser.for(addonInstance).register(
      addonInstance,
      () => 'addon won' as unknown as AutoImport
    );
    LeaderChooser.for(appInstance).register(
      appInstance,
      () => 'app won' as unknown as AutoImport
    );
    assert.throws(() => {
      LeaderChooser.for(appInstance).leader;
    }, /To use these addons, your app needs ember-auto-import >= 2: intermediate/);
  });

  test('1.x version in addon is ignored', function (assert) {
    let project = new FakeProject({
      name: 'sample-app',
      devDependencies: {
        'ember-auto-import': '^2.0.0',
      },
    });
    let appInstance = project.fakeAddon('ember-auto-import', '2.0.0');
    let addonInstance = project
      .fakeAddon('intermediate')
      .fakeAddon('ember-auto-import', '1.10.1');

    LeaderChooser.for(appInstance).register(
      appInstance,
      () => 'app won' as unknown as AutoImport
    );
    LeaderChooser.for(addonInstance).register(
      addonInstance,
      () => 'addon won' as unknown as AutoImport
    );
    assert.equal(LeaderChooser.for(appInstance).leader, 'app won');
  });

  test('newer non-compatible version does not win', function (assert) {
    let project = new FakeProject({
      name: 'sample-app',
      devDependencies: {
        'ember-auto-import': '2.1.x',
      },
    });
    let appInstance = project.fakeAddon('ember-auto-import', '2.1.0');
    let addonInstance = project
      .fakeAddon('intermediate')
      .fakeAddon('ember-auto-import', '2.1.4');
    let tooNewInstance = project
      .fakeAddon('intermediate2')
      .fakeAddon('ember-auto-import', '2.2.0');

    LeaderChooser.for(appInstance).register(
      appInstance,
      () => 'app won' as unknown as AutoImport
    );
    LeaderChooser.for(addonInstance).register(
      addonInstance,
      () => 'addon won' as unknown as AutoImport
    );
    LeaderChooser.for(tooNewInstance).register(
      tooNewInstance,
      () => 'too new won' as unknown as AutoImport
    );

    assert.equal(LeaderChooser.for(appInstance).leader, 'addon won');
  });
});
