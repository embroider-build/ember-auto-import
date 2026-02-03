import QUnit from 'qunit';
import Handlebars from 'handlebars';
import jsStringEscape from 'js-string-escape';
import { createHash } from 'crypto';
import { moduleToId, idToModule, clearModuleIdMap } from '../webpack';

const { module: Qmodule, test } = QUnit;

// Register the same helpers used in webpack.ts for template testing
Handlebars.registerHelper('js-string-escape', jsStringEscape);
Handlebars.registerHelper('test-module-to-id', moduleToId);

Qmodule('webpack module-to-id', function (hooks) {
  hooks.beforeEach(function () {
    // Clear the module ID map before each test to ensure isolation
    clearModuleIdMap();
  });

  hooks.afterEach(function () {
    // Clean up to prevent state leaking to other test files
    clearModuleIdMap();
  });

  Qmodule('moduleToId', function () {
    test('returns the specifier unchanged for normal strings', function (assert) {
      assert.equal(moduleToId('lodash'), 'lodash');
      assert.equal(moduleToId('my-package/utils'), 'my-package/utils');
      assert.equal(moduleToId('@scope/package'), '@scope/package');
      assert.equal(
        moduleToId('@scope/package/deep/path'),
        '@scope/package/deep/path'
      );
    });

    test('handles edge case specifiers', function (assert) {
      // Empty string should pass through unchanged (no quotes)
      assert.equal(moduleToId(''), '');

      // Specifiers with other special characters (no quotes) pass through
      assert.equal(moduleToId('pkg-with-dashes'), 'pkg-with-dashes');
      assert.equal(moduleToId('pkg_with_underscores'), 'pkg_with_underscores');
      assert.equal(moduleToId('pkg.with.dots'), 'pkg.with.dots');
      assert.equal(moduleToId('@scope/pkg'), '@scope/pkg');
    });

    test('returns a hash for specifiers containing double quotes', function (assert) {
      const specifier = 'some"module';
      const id = moduleToId(specifier);

      // Should return a hash, not the original specifier
      assert.notEqual(id, specifier);
      // MD5 hash is 32 hex characters
      assert.equal(id.length, 32);
      assert.ok(/^[a-f0-9]+$/.test(id), 'ID should be a hex string');
    });

    test('returns a hash for specifiers containing single quotes', function (assert) {
      const specifier = "some'module";
      const id = moduleToId(specifier);

      // Should return a hash, not the original specifier
      assert.notEqual(id, specifier);
      // MD5 hash is 32 hex characters
      assert.equal(id.length, 32);
      assert.ok(/^[a-f0-9]+$/.test(id), 'ID should be a hex string');
    });

    test('returns different hashes for different specifiers with quotes', function (assert) {
      const specifier1 = 'module"one';
      const specifier2 = 'module"two';
      const specifier3 = "module'three";

      const id1 = moduleToId(specifier1);
      const id2 = moduleToId(specifier2);
      const id3 = moduleToId(specifier3);

      // All should be different hashes
      assert.notEqual(
        id1,
        id2,
        'Different specifiers should produce different hashes'
      );
      assert.notEqual(
        id1,
        id3,
        'Different specifiers should produce different hashes'
      );
      assert.notEqual(
        id2,
        id3,
        'Different specifiers should produce different hashes'
      );
    });

    test('returns the same hash for the same specifier with quotes', function (assert) {
      const specifier = 'module"test';

      // Clear and call twice
      clearModuleIdMap();
      const id1 = moduleToId(specifier);
      clearModuleIdMap();
      const id2 = moduleToId(specifier);

      assert.equal(id1, id2, 'Same specifier should produce same hash');
    });

    test('hash is derived from actual specifier content', function (assert) {
      // This test verifies the fix for the hash collision bug.
      // Previously, all specifiers with quotes used createHash('md5').update('some_string')
      // which caused hash collisions. Now it uses the actual specifier.
      const specifier = 'my-addon/file"with"quotes.js';
      const id = moduleToId(specifier);

      // Verify the hash matches what we'd expect from hashing the actual specifier
      const expectedHash = createHash('md5').update(specifier).digest('hex');
      assert.equal(
        id,
        expectedHash,
        'Hash should be derived from the actual specifier, not a fixed string'
      );

      // Verify a different specifier produces a different hash
      const otherSpecifier = 'other-addon/file"different.js';
      const otherId = moduleToId(otherSpecifier);
      const otherExpectedHash = createHash('md5')
        .update(otherSpecifier)
        .digest('hex');
      assert.equal(
        otherId,
        otherExpectedHash,
        'Each specifier should have its own unique hash'
      );
      assert.notEqual(
        id,
        otherId,
        'Different specifiers must produce different hashes'
      );
    });
  });

  Qmodule('idToModule', function () {
    test('returns the original specifier for normal strings (no mapping needed)', function (assert) {
      const specifier = 'lodash';
      const id = moduleToId(specifier);

      // For normal strings, id === specifier, so idToModule just returns the input
      assert.equal(idToModule(id), specifier);
    });

    test('returns the original specifier when given a hash', function (assert) {
      const specifier = 'module"with"quotes';
      const id = moduleToId(specifier);

      // id is now a hash, idToModule should map it back
      assert.equal(idToModule(id), specifier);
    });

    test('maps multiple different hashed specifiers correctly', function (assert) {
      const specifier1 = 'first"module';
      const specifier2 = 'second"module';
      const specifier3 = "third'module";

      const id1 = moduleToId(specifier1);
      const id2 = moduleToId(specifier2);
      const id3 = moduleToId(specifier3);

      // Each should map back to its original
      assert.equal(idToModule(id1), specifier1);
      assert.equal(idToModule(id2), specifier2);
      assert.equal(idToModule(id3), specifier3);
    });

    test('returns the id unchanged if not found in map', function (assert) {
      const unknownId = 'unknown-id-not-in-map';
      assert.equal(idToModule(unknownId), unknownId);
    });
  });

  Qmodule('round-trip', function () {
    test('moduleToId and idToModule are inverses for specifiers with quotes', function (assert) {
      const specifiers = [
        'pkg"name',
        "pkg'name",
        'pkg"name\'mixed',
        '@scope/pkg"test',
        'deep/path"with/quotes',
      ];

      for (const specifier of specifiers) {
        const id = moduleToId(specifier);
        const recovered = idToModule(id);
        assert.equal(
          recovered,
          specifier,
          `Round-trip should work for: ${specifier}`
        );
      }
    });

    test('moduleToId and idToModule are inverses for normal specifiers', function (assert) {
      const specifiers = [
        'lodash',
        '@scope/package',
        'deep/nested/path',
        'pkg-with-dashes',
      ];

      for (const specifier of specifiers) {
        const id = moduleToId(specifier);
        const recovered = idToModule(id);
        assert.equal(
          recovered,
          specifier,
          `Round-trip should work for: ${specifier}`
        );
      }
    });
  });

  Qmodule('entry template integration', function () {
    // This template mirrors the staticImports portion of the real entryTemplate
    // to verify that EAI_DISCOVERED_EXTERNALS uses resolvedSpecifier
    const testTemplate = Handlebars.compile(
      `{{#each staticImports as |module|}}d('{{js-string-escape module.requestedSpecifier}}', EAI_DISCOVERED_EXTERNALS('{{test-module-to-id module.resolvedSpecifier}}'), function() { return require('{{js-string-escape module.resolvedSpecifier}}'); });
{{/each}}`,
      { noEscape: true }
    );

    test('EAI_DISCOVERED_EXTERNALS uses resolvedSpecifier, not requestedSpecifier', function (assert) {
      const output = testTemplate({
        staticImports: [
          {
            requestedSpecifier: 'my-addon',
            resolvedSpecifier: 'my-addon/dist/index.js',
          },
        ],
      });

      // The AMD module name should use requestedSpecifier
      assert.ok(
        output.includes("d('my-addon',"),
        'AMD module name should use requestedSpecifier'
      );

      // EAI_DISCOVERED_EXTERNALS should use resolvedSpecifier
      assert.ok(
        output.includes("EAI_DISCOVERED_EXTERNALS('my-addon/dist/index.js')"),
        'EAI_DISCOVERED_EXTERNALS should use resolvedSpecifier'
      );

      // The require should also use resolvedSpecifier
      assert.ok(
        output.includes("require('my-addon/dist/index.js')"),
        'require should use resolvedSpecifier'
      );
    });

    test('EAI_DISCOVERED_EXTERNALS uses hash when resolvedSpecifier contains quotes', function (assert) {
      const resolvedSpecifier = 'my-addon/dist/file"with"quotes.js';
      const output = testTemplate({
        staticImports: [
          {
            requestedSpecifier: 'my-addon',
            resolvedSpecifier,
          },
        ],
      });

      // The AMD module name should use requestedSpecifier
      assert.ok(
        output.includes("d('my-addon',"),
        'AMD module name should use requestedSpecifier'
      );

      // EAI_DISCOVERED_EXTERNALS should use the hash of resolvedSpecifier
      const expectedHash = moduleToId(resolvedSpecifier);
      assert.ok(
        output.includes(`EAI_DISCOVERED_EXTERNALS('${expectedHash}')`),
        'EAI_DISCOVERED_EXTERNALS should use hash of resolvedSpecifier when it contains quotes'
      );

      // Verify the hash can be mapped back
      assert.equal(
        idToModule(expectedHash),
        resolvedSpecifier,
        'Hash should map back to original resolvedSpecifier'
      );
    });

    test('different resolvedSpecifiers with quotes get different hashes in template', function (assert) {
      const resolved1 = 'addon1/file"one.js';
      const resolved2 = 'addon2/file"two.js';

      const output = testTemplate({
        staticImports: [
          { requestedSpecifier: 'addon1', resolvedSpecifier: resolved1 },
          { requestedSpecifier: 'addon2', resolvedSpecifier: resolved2 },
        ],
      });

      const hash1 = moduleToId(resolved1);
      const hash2 = moduleToId(resolved2);

      // Hashes should be different
      assert.notEqual(
        hash1,
        hash2,
        'Different specifiers should have different hashes'
      );

      // Both hashes should appear in output
      assert.ok(
        output.includes(`EAI_DISCOVERED_EXTERNALS('${hash1}')`),
        'First hash should be in output'
      );
      assert.ok(
        output.includes(`EAI_DISCOVERED_EXTERNALS('${hash2}')`),
        'Second hash should be in output'
      );

      // Both should map back correctly
      assert.equal(idToModule(hash1), resolved1);
      assert.equal(idToModule(hash2), resolved2);
    });

    test('requestedSpecifier and resolvedSpecifier can differ', function (assert) {
      // This tests the key scenario: user imports 'my-addon' but it resolves to 'my-addon/dist/index.js'
      // The AMD module should be named 'my-addon' but dependency lookup should use 'my-addon/dist/index.js'
      const output = testTemplate({
        staticImports: [
          {
            requestedSpecifier: '@scope/my-addon',
            resolvedSpecifier: '@scope/my-addon/dist/esm/index.js',
          },
        ],
      });

      // AMD module name uses requestedSpecifier (what the consumer imports)
      assert.ok(
        output.includes("d('@scope/my-addon',"),
        'AMD module should be named with requestedSpecifier'
      );

      // Dependency lookup uses resolvedSpecifier (what webpack actually bundled)
      assert.ok(
        output.includes(
          "EAI_DISCOVERED_EXTERNALS('@scope/my-addon/dist/esm/index.js')"
        ),
        'Dependency lookup should use resolvedSpecifier'
      );

      // Require uses resolvedSpecifier
      assert.ok(
        output.includes("require('@scope/my-addon/dist/esm/index.js')"),
        'require should use resolvedSpecifier'
      );
    });

    test('works when requestedSpecifier equals resolvedSpecifier', function (assert) {
      // Common case: specifier doesn't change during resolution (e.g., node_modules package)
      const output = testTemplate({
        staticImports: [
          {
            requestedSpecifier: 'lodash',
            resolvedSpecifier: 'lodash',
          },
        ],
      });

      // All three should use the same specifier
      assert.ok(
        output.includes("d('lodash',"),
        'AMD module name should be lodash'
      );
      assert.ok(
        output.includes("EAI_DISCOVERED_EXTERNALS('lodash')"),
        'EAI_DISCOVERED_EXTERNALS should use lodash'
      );
      assert.ok(
        output.includes("require('lodash')"),
        'require should use lodash'
      );
    });

    test('handles multiple imports with mixed specifier types', function (assert) {
      const output = testTemplate({
        staticImports: [
          {
            requestedSpecifier: 'lodash',
            resolvedSpecifier: 'lodash', // same
          },
          {
            requestedSpecifier: 'my-addon',
            resolvedSpecifier: 'my-addon/dist/index.js', // different
          },
          {
            requestedSpecifier: 'special-pkg',
            resolvedSpecifier: 'special-pkg/file"quoted.js', // has quotes
          },
        ],
      });

      // First import: same specifiers
      assert.ok(output.includes("d('lodash',"), 'lodash AMD name');
      assert.ok(
        output.includes("EAI_DISCOVERED_EXTERNALS('lodash')"),
        'lodash lookup'
      );

      // Second import: different specifiers
      assert.ok(output.includes("d('my-addon',"), 'my-addon AMD name');
      assert.ok(
        output.includes("EAI_DISCOVERED_EXTERNALS('my-addon/dist/index.js')"),
        'my-addon lookup uses resolved'
      );

      // Third import: quoted specifier gets hashed
      assert.ok(output.includes("d('special-pkg',"), 'special-pkg AMD name');
      const hash = moduleToId('special-pkg/file"quoted.js');
      assert.ok(
        output.includes(`EAI_DISCOVERED_EXTERNALS('${hash}')`),
        'special-pkg lookup uses hash'
      );
    });
  });
});
