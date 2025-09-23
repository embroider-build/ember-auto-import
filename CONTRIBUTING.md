## Contributing

### Code organization

The actual ember addon is in `./packages/ember-auto-import`.

Our tests are driven through a system of layered scenarios in `./test-scenarios`. Those scenarios are built off `./packages/app-template` and `./packages/addon-template` which are nearly-empty examples of an Ember app and addon.

### Installation

- `git clone <repository-url>`
- `cd ember-auto-import`
- `npm install`

### Building

You'll need to run the typescript compiler if you're making changes:

```
npm run watch
```

### Running tests

Use these commands in the `./test-scenarios` directory.

- `npm run test` runs all test scenarios. This is a lot of scenarios, and it may be easier to let GitHub actions run them for your in parallel.

- `npm run test:list` list the names of all scenarios.

- `npm run test -- --filter $SCENARIO_NAME` run one scenario by name
- `npm run test:output -- --scenario $SCENARIO_NAME` writes out the scenario as a real on-disk app that you can inspect, run, and debug.
