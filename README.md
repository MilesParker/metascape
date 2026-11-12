# Metascape

Agent-based modelling for the web: a typed, deterministic simulation engine, a strongly typed
declarative model format, and React tooling for running and exploring models.

Metascape is the successor to [Ascape](https://github.com/MilesParker/ascape) and the
[Eclipse Agent Modeling Platform](https://github.com/MilesParker/amp). It is a new design in
TypeScript, not a port, and is not source-compatible with either.

**Status:** early but working end to end. Thirteen example models run in the browser.

## Packages

| Path              | Package             | Purpose                                                              |
| ----------------- | ------------------- | -------------------------------------------------------------------- |
| `packages/engine` | `@metascape/engine` | Headless engine: simulations, scapes, spaces, data, run control      |
| `packages/models` | `@metascape/models` | Eight classic models written in TypeScript                           |
| `packages/spec`   | `@metascape/spec`   | Models as data: typed format, checker, interpreter and five examples |
| `packages/react`  | `@metascape/react`  | React views, charts, controls and a ready-made model runner          |
| `apps/studio`     | `@metascape/studio` | Browser app that lists the example models and runs the chosen one    |

## A model in code

```ts
import { Cell, defineModel, GridScape, gridView, int, colors, rgb } from '@metascape/engine';

class LifeCell extends Cell {
  on = false;
  next = false;
}

export const life = defineModel({
  name: 'Life',
  parameters: { size: int(60, { min: 3, max: 400 }) },
  build(sim) {
    const size = sim.parameters.size;
    const cells = sim.addScape(
      new GridScape<LifeCell>({
        name: 'cells',
        width: size,
        height: size,
        create: () => new LifeCell(),
      }),
    );
    cells.addInitialRule('seed', (cell) => (cell.on = cell.random.chance(0.3)));
    cells.addRule({
      name: 'life',
      execute(cell) {
        let live = 0;
        for (const neighbor of cell.neighbors) if (neighbor.on) live++;
        cell.next = live === 3 || (cell.on && live === 2);
      },
      update: (cell) => (cell.on = cell.next),
    });
    sim.data.count(cells, 'live', (cell) => cell.on);
    sim.addView(
      gridView<LifeCell>({
        title: 'Cells',
        grid: cells,
        cellColor: (c) => (c.on ? colors.green : rgb(24, 28, 34)),
      }),
    );
  },
});
```

The same model can be written purely as data in the `@metascape/spec` format; see
`packages/spec/src/examples`.

## Principles

- **Deterministic.** A run is fully determined by its model, parameters and seed.
- **Strongly typed.** Models are checked by the compiler; models written as data are validated
  and type-checked when loaded, with errors that point at the exact place.
- **Headless first.** The engine has no UI dependencies and runs in Node, browsers and workers.

## Development

Requires Node 24 or later.

```bash
npm install
npm run dev     # start Studio
npm run check   # format check, lint, typecheck, tests, build
```

## License

[Eclipse Public License 2.0](LICENSE). See [NOTICE](NOTICE) for attribution.
