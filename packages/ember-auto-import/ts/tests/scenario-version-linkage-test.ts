import { readJSONSync } from 'fs-extra';
import { resolve } from 'path';
import QUnit from 'qunit';
const { module: Qmodule, test } = QUnit;

Qmodule('self-version-check', function () {
  test('scenarios are testing this ember-auto-import version', async function (assert) {
    let ourVersion = readJSONSync(
      resolve(__dirname, '../../package.json')
    ).version;

    let scenariosVersion = readJSONSync(
      resolve(__dirname, '../../../../test-scenarios/package.json')
    ).devDependencies['ember-auto-import'];

    assert.equal(scenariosVersion, ourVersion);
  });
});
