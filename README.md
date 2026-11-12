# Metascape

Agent-based modelling for the web: a typed, deterministic simulation engine, a strongly typed
declarative model format, and React tooling for running and exploring models.

Metascape is the successor to [Ascape](https://github.com/MilesParker/ascape) and the
[Eclipse Agent Modeling Platform](https://github.com/MilesParker/amp). It is a new design in
TypeScript, not a port, and is not source-compatible with either.

**Status:** early but working end to end. Studio runs 132 models: 127 written in TypeScript and
5 written as data. Among them are the Brookings Institution models and the other examples
from Ascape and Eclipse AMP, ported with their provenance. Open work is listed in
[docs/roadmap.md](docs/roadmap.md).

## Packages

| Path              | Package             | Purpose                                                               |
| ----------------- | ------------------- | --------------------------------------------------------------------- |
| `packages/engine` | `@metascape/engine` | Headless engine: simulations, scapes, spaces, data, run control       |
| `packages/models` | `@metascape/models` | The model catalogue: 25 families, 127 models (see below)              |
| `packages/spec`   | `@metascape/spec`   | Models as data: typed format, checker, interpreter and five examples  |
| `packages/react`  | `@metascape/react`  | Views, charts, run controls, rule and chart editing, a model runner   |
| `apps/studio`     | `@metascape/studio` | Browser app: pick a family and model, run, inspect and reconfigure it |

## The model catalogue

| Collection                                  | Directory                        | Families | Models |
| ------------------------------------------- | -------------------------------- | -------- | ------ |
| Introductory examples written for Metascape | `packages/models/src/<model>/`   | 1        | 8      |
| Brookings Institution models (from Ascape)  | `packages/models/src/brookings/` | 14       | 82     |
| Ascape example models                       | `packages/models/src/ascape/`    | 3        | 23     |
| Eclipse AMP example models                  | `packages/models/src/amp/`       | 7        | 14     |

The Brookings collection includes Sugarscape (every chapter II to IV variant), Artificial
Anasazi with the Long House Valley data, Civil Violence (every paper run), Norms, Retirement,
Emergence of Classes, Emergence of Firms, the demographic and spatial Prisoner's Dilemmas,
Diffusion, Conway's Life and others.

Ported models are faithful to the legacy code, including its quirks and bugs: each family's
`README.md` lists every legacy class, how it was ported, and every kept bug or deviation.
Each model carries its provenance (authors, publication, the legacy class it came from, and the
original copyright), which Studio shows under the model's name. See [NOTICE](NOTICE) and
[LICENSES](LICENSES) for the BSD terms of the Ascape-derived files.

## Changing a model while it runs

As in Ascape, a model's behaviour can be changed in Studio without code:

- **Parameters:** edit and apply with a restart.
- **Rules:** for each scape, switch rules on and off, reorder them, and choose the execution
  order (by agent or by rule), the visit order (shuffled or sequential), and complete tour or
  repeated draw with a number of agents per step. Changes apply at once.
- **Charts:** pick which recorded series each chart shows (measures by statistics), switch
  between time series and bars, and add or remove charts.

Rule and chart choices survive restarts of the model until reset. The engine side is in
`packages/engine/src/settings.ts` (`SettingsStore`, `readScapeSettings`, `applyScapeSettings`).

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
