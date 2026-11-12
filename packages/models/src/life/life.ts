// SPDX-License-Identifier: EPL-2.0
import {
  bool,
  Cell,
  choice,
  colors,
  defineModel,
  GridScape,
  gridView,
  int,
  real,
  rgb,
  timeSeriesView,
} from '@metascape/engine';

/** Cell offsets (column, row) of each named starting pattern, relative to its top left corner. */
const PATTERNS = {
  glider: [
    [1, 0],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
  ],
  blinker: [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  'r-pentomino': [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
    [1, 2],
  ],
} as const satisfies Record<string, readonly (readonly [number, number])[]>;

/** One site of the Life lattice. (`on`, not `alive`, which is the engine's membership flag.) */
export class LifeCell extends Cell {
  on = false;
  /** The state computed in the execute phase and applied in the update phase. */
  next = false;
}

/**
 * Conway's Game of Life on a lattice that is a torus or has hard edges.
 *
 * Updating is synchronous: every cell computes its next state from the current
 * states in `execute`, and all cells switch in `update`.
 */
export const life = defineModel({
  name: 'Game of Life',
  description:
    "John Conway's Game of Life (Martin Gardner, Scientific American, October 1970): a " +
    'two-dimensional cellular automaton in which a live cell survives with two or three live ' +
    'neighbors and a dead cell comes alive with exactly three. Simple local rules produce ' +
    'oscillators, gliders that travel across the lattice and long-lived chaotic growth, and ' +
    'it is the standard demonstration of emergence in agent-based systems.',
  parameters: {
    width: int(60, { min: 3, max: 400, label: 'Width', description: 'Number of columns.' }),
    height: int(60, { min: 3, max: 400, label: 'Height', description: 'Number of rows.' }),
    density: real(0.3, {
      min: 0,
      max: 1,
      label: 'Density',
      description: 'Probability that a cell starts alive (random pattern only).',
    }),
    wrap: bool(true, {
      label: 'Wrap',
      description: 'Join the edges into a torus; otherwise cells beyond the edge are dead.',
    }),
    pattern: choice(['random', 'glider', 'blinker', 'r-pentomino'], 'random', {
      label: 'Pattern',
      description: 'Starting configuration: random soup, or a known pattern in the middle.',
    }),
  },

  build(sim) {
    const { width, height, density, wrap, pattern } = sim.parameters;
    const originX = Math.floor(width / 2) - 1;
    const originY = Math.floor(height / 2) - 1;
    const initiallyAlive = new Set<number>();
    if (pattern !== 'random') {
      for (const [dx, dy] of PATTERNS[pattern]) {
        initiallyAlive.add((originY + dy) * width + originX + dx);
      }
    }

    const cells = sim.addScape(
      new GridScape<LifeCell>({
        name: 'cells',
        width,
        height,
        wrap,
        neighborhood: 'moore',
        order: 'sequential',
        create: () => new LifeCell(),
      }),
    );
    cells.addInitialRule({
      name: 'seed',
      execute(cell) {
        cell.on =
          pattern === 'random'
            ? cell.random.chance(density)
            : initiallyAlive.has(cell.y * width + cell.x);
      },
    });
    cells.addRule({
      name: 'life',
      execute(cell) {
        let live = 0;
        for (const neighbor of cell.neighbors) if (neighbor.on) live++;
        cell.next = live === 3 || (cell.on && live === 2);
      },
      update(cell) {
        cell.on = cell.next;
      },
    });

    sim.data.count(cells, 'live', (cell) => cell.on);
  },

  views(sim) {
    const cells = sim.scape('cells') as GridScape<LifeCell>;
    return [
      gridView<LifeCell>({
        title: 'Cells',
        grid: cells,
        cellColor: (cell) => (cell.on ? colors.green : rgb(24, 28, 34)),
      }),
      timeSeriesView({ title: 'Live cells', series: ['live'], colors: { live: colors.green } }),
    ];
  },
});
