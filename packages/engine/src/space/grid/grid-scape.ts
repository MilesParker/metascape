// SPDX-License-Identifier: EPL-2.0
import { Scape, type ScapeOptions } from '../../scape';
import { Cell, placeCell } from './cell';

/** Which cells count as neighbors: the 8 surrounding cells, or the 4 orthogonal ones. */
export type Neighborhood = 'moore' | 'vonNeumann';

/** How distance between cells is measured. */
export type Metric = 'chebyshev' | 'manhattan' | 'euclidean';

/** Options of {@link GridScape.within}. */
export interface WithinOptions {
  /** Default: the grid's natural metric (chebyshev for moore, manhattan for vonNeumann). */
  readonly metric?: Metric;
  /** Include the origin cell. Default false. */
  readonly includeSelf?: boolean;
}

export interface GridScapeOptions<C extends Cell = Cell> extends Omit<
  ScapeOptions<C>,
  'create' | 'size'
> {
  readonly width: number;
  readonly height: number;
  /** Edges join up (a torus). Default true. */
  readonly wrap?: boolean;
  /** Default `moore`. */
  readonly neighborhood?: Neighborhood;
  /** Allow several occupants on one cell. Default false. */
  readonly multiOccupancy?: boolean;
  /** Creates the cell at a position. Default: a plain {@link Cell}. */
  readonly create?: (x: number, y: number) => C;
}

interface Offset {
  readonly dx: number;
  readonly dy: number;
}

/** Offsets of the neighborhoods in row-major order: top row first, left to right. */
const MOORE: readonly Offset[] = [
  { dx: -1, dy: -1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: -1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: 1, dy: 1 },
];
const VON_NEUMANN: readonly Offset[] = [
  { dx: 0, dy: -1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
];

function offsetDistance(metric: Metric, dx: number, dy: number): number {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (metric === 'chebyshev') return Math.max(ax, ay);
  if (metric === 'manhattan') return ax + ay;
  return Math.sqrt(ax * ax + ay * ay);
}

/**
 * A fixed lattice of `width` x `height` cells, in a torus (default) or with
 * hard edges. Coordinates start at the top left; y grows downward.
 *
 * Cells are created in row-major order when the simulation populates the
 * scape (y outer loop, x inner), so `members[y * width + x]` is the cell at
 * (x, y). Membership is fixed afterwards: cells cannot be added or removed.
 *
 * Agents that move about on the grid are {@link Occupant}s living in a
 * separate scape. Everything here that picks at random uses the grid's own
 * `random` stream.
 */
export class GridScape<C extends Cell = Cell> extends Scape<C> {
  readonly width: number;
  readonly height: number;
  readonly wrap: boolean;
  readonly neighborhood: Neighborhood;
  readonly multiOccupancy: boolean;

  readonly #createCell: (x: number, y: number) => C;
  readonly #cells: C[] = [];
  readonly #neighborCache: (readonly C[] | undefined)[] = [];
  readonly #templates = new Map<string, readonly Offset[]>();
  #populating = false;
  #populated = false;

  constructor(options: GridScapeOptions<C>) {
    const { width, height, wrap, neighborhood, multiOccupancy, create, ...base } = options;
    super(base);
    for (const [label, value] of [
      ['width', width],
      ['height', height],
    ] as const) {
      if (!Number.isInteger(value) || value < 1) {
        throw new RangeError(`GridScape "${this.name}": ${label} must be a positive integer`);
      }
    }
    this.width = width;
    this.height = height;
    this.wrap = wrap ?? true;
    this.neighborhood = neighborhood ?? 'moore';
    this.multiOccupancy = multiOccupancy ?? false;
    this.#createCell = create ?? ((): C => new Cell() as C);
  }

  /** The metric used when none is given: chebyshev for moore, manhattan for vonNeumann. */
  get defaultMetric(): Metric {
    return this.neighborhood === 'moore' ? 'chebyshev' : 'manhattan';
  }

  /** Creates every cell, in row-major order. Called by the simulation. */
  override populate(): void {
    if (this.#populated) throw new Error(`GridScape "${this.name}" is already populated`);
    this.#populating = true;
    try {
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          const cell = this.#createCell(x, y);
          placeCell(cell, x, y);
          this.#cells.push(cell);
          this.add(cell);
        }
      }
    } finally {
      this.#populating = false;
      this.#populated = true;
    }
  }

  /** Not allowed after population: the lattice is fixed. */
  override add(agent: C): C {
    if (!this.#populating) {
      throw new Error(`GridScape "${this.name}" has fixed membership: cells cannot be added`);
    }
    return super.add(agent);
  }

  /** Not supported: a grid has no `create(index)` function. */
  override spawn(): C {
    throw new Error(`GridScape "${this.name}" has fixed membership: cells cannot be spawned`);
  }

  /** Not allowed: the lattice is fixed. */
  override remove(_agent: C): boolean {
    throw new Error(`GridScape "${this.name}" has fixed membership: cells cannot be removed`);
  }

  /**
   * The cell at (x, y). With `wrap`, coordinates wrap around the edges; without,
   * out-of-range coordinates (and non-integers) give `undefined`.
   */
  at(x: number, y: number): C | undefined {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
    return this.#resolve(x, y);
  }

  /**
   * The neighbors of a cell as a read-only array, computed once.
   *
   * Order: row-major by offset, that is the row above first, left to right,
   * then the cell to the left and right, then the row below. Moore:
   * (-1,-1) (0,-1) (1,-1) (-1,0) (1,0) (-1,1) (0,1) (1,1). Von Neumann:
   * (0,-1) (-1,0) (1,0) (0,1). Bounded grids have fewer at edges. On tiny
   * wrapped grids a cell is never listed twice and never lists itself.
   */
  neighbors(cell: C): readonly C[] {
    const index = this.#indexOf(cell);
    let cached = this.#neighborCache[index];
    if (!cached) {
      const found: C[] = [];
      for (const { dx, dy } of this.neighborhood === 'moore' ? MOORE : VON_NEUMANN) {
        const other = this.#resolve(cell.x + dx, cell.y + dy);
        if (other && other !== cell && !found.includes(other)) found.push(other);
      }
      cached = Object.freeze(found) as readonly C[];
      this.#neighborCache[index] = cached;
    }
    return cached;
  }

  /** Distance between two cells, the shortest way round on a torus. */
  distance(a: Cell, b: Cell, metric: Metric = this.defaultMetric): number {
    let dx = Math.abs(a.x - b.x);
    let dy = Math.abs(a.y - b.y);
    if (this.wrap) {
      dx = Math.min(dx, this.width - dx);
      dy = Math.min(dy, this.height - dy);
    }
    return offsetDistance(metric, dx, dy);
  }

  /**
   * All cells at distance <= `radius` (the origin only with `includeSelf`),
   * each at most once, in row-major order of their offsets from the origin
   * (nearest row above first). Offset templates are cached per metric and radius.
   */
  within(cell: C, radius: number, options: WithinOptions = {}): C[] {
    const metric = options.metric ?? this.defaultMetric;
    const includeSelf = options.includeSelf ?? false;
    this.#indexOf(cell);
    const template = this.#withinTemplate(metric, radius);
    return this.#collect(cell, template, includeSelf, this.#needsDedupe(radius));
  }

  /**
   * "Line of sight": the cells in each neighborhood direction (4 for
   * vonNeumann, 8 for moore) up to `range` steps away, nearest first,
   * direction by direction in the order of {@link neighbors}. The origin is
   * never included and no cell is listed twice (relevant on small tori).
   */
  rays(cell: C, range: number): C[] {
    this.#indexOf(cell);
    const result: C[] = [];
    const seen = new Set<C>([cell]);
    const steps = Math.floor(range);
    for (const { dx, dy } of this.neighborhood === 'moore' ? MOORE : VON_NEUMANN) {
      for (let step = 1; step <= steps; step++) {
        const other = this.#resolve(cell.x + dx * step, cell.y + dy * step);
        // Off the edge, or (on a torus) all the way round to the origin.
        if (!other || other === cell) break;
        if (seen.has(other)) continue;
        seen.add(other);
        result.push(other);
      }
    }
    return result;
  }

  /**
   * The nearest cell other than the origin satisfying `condition`, searching
   * outward ring by ring by the default metric. Ties at the same distance are
   * broken uniformly at random. `undefined` if there is none within `maxRadius`.
   */
  nearest(cell: C, condition: (cell: C) => boolean, maxRadius = Infinity): C | undefined {
    this.#indexOf(cell);
    const manhattan = this.defaultMetric === 'manhattan';
    const limit = Math.min(
      Math.floor(maxRadius),
      this.wrap
        ? manhattan
          ? Math.floor(this.width / 2) + Math.floor(this.height / 2)
          : Math.floor(Math.max(this.width, this.height) / 2)
        : manhattan
          ? this.width + this.height - 2
          : Math.max(this.width, this.height) - 1,
    );
    for (let radius = 1; radius <= limit; radius++) {
      const ring = this.#ringTemplate(radius);
      const found = this.#collect(cell, ring, false, this.wrap).filter(condition);
      if (found.length > 0) return this.random.pick(found);
    }
    return undefined;
  }

  /** A uniformly chosen cell, optionally among those satisfying a condition. */
  randomCell(condition?: (cell: C) => boolean): C | undefined {
    return this.randomMember(condition);
  }

  /** A uniformly chosen cell without occupants, if there is one. */
  randomAvailableCell(): C | undefined {
    return this.randomMember((cell) => cell.isAvailable);
  }

  /**
   * The neighbor of `from` that brings it closest to `to` by the default
   * metric (random among equals), or `undefined` if no neighbor is closer.
   */
  toward(from: C, to: Cell): C | undefined {
    return this.#step(from, to, -1);
  }

  /**
   * The neighbor of `from` that takes it farthest from `to` by the default
   * metric (random among equals), or `undefined` if no neighbor is farther.
   */
  away(from: C, to: Cell): C | undefined {
    return this.#step(from, to, 1);
  }

  #step(from: C, to: Cell, sign: 1 | -1): C | undefined {
    let best = this.distance(from, to);
    let candidates: C[] = [];
    for (const other of this.neighbors(from)) {
      const d = this.distance(other, to);
      if (d * sign > best * sign) {
        best = d;
        candidates = [other];
      } else if (d === best && candidates.length > 0) {
        candidates.push(other);
      }
    }
    return candidates.length === 0 ? undefined : this.random.pick(candidates);
  }

  #indexOf(cell: Cell): number {
    const index = cell.y * this.width + cell.x;
    if (this.#cells[index] !== (cell as unknown as C)) {
      throw new Error(`Cell is not a member of GridScape "${this.name}"`);
    }
    return index;
  }

  #resolve(x: number, y: number): C | undefined {
    if (this.wrap) {
      x = ((x % this.width) + this.width) % this.width;
      y = ((y % this.height) + this.height) % this.height;
    } else if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return undefined;
    }
    return this.#cells[y * this.width + x];
  }

  /** The largest useful offset along each axis. */
  #reach(radius: number): { rx: number; ry: number } {
    const r = Math.floor(radius);
    return this.wrap
      ? {
          rx: Math.min(r, Math.floor(this.width / 2)),
          ry: Math.min(r, Math.floor(this.height / 2)),
        }
      : { rx: Math.min(r, this.width - 1), ry: Math.min(r, this.height - 1) };
  }

  /** Whether distinct offsets can land on the same cell. */
  #needsDedupe(radius: number): boolean {
    if (!this.wrap) return false;
    const { rx, ry } = this.#reach(radius);
    return 2 * rx + 1 > this.width || 2 * ry + 1 > this.height;
  }

  #withinTemplate(metric: Metric, radius: number): readonly Offset[] {
    const key = `${metric}:${radius}`;
    let template = this.#templates.get(key);
    if (!template) {
      const offsets: Offset[] = [];
      if (radius >= 0) {
        const { rx, ry } = this.#reach(radius);
        for (let dy = -ry; dy <= ry; dy++) {
          for (let dx = -rx; dx <= rx; dx++) {
            if (offsetDistance(metric, dx, dy) <= radius) offsets.push({ dx, dy });
          }
        }
      }
      template = offsets;
      this.#templates.set(key, template);
    }
    return template;
  }

  #ringTemplate(radius: number): readonly Offset[] {
    const key = `ring:${radius}`;
    let template = this.#templates.get(key);
    if (!template) {
      const metric = this.defaultMetric;
      const offsets: Offset[] = [];
      const { rx, ry } = this.#reach(radius);
      for (let dy = -ry; dy <= ry; dy++) {
        for (let dx = -rx; dx <= rx; dx++) {
          if (offsetDistance(metric, dx, dy) === radius) offsets.push({ dx, dy });
        }
      }
      template = offsets;
      this.#templates.set(key, template);
    }
    return template;
  }

  #collect(origin: C, template: readonly Offset[], includeSelf: boolean, dedupe: boolean): C[] {
    const result: C[] = [];
    const seen = dedupe ? new Set<C>() : undefined;
    for (const { dx, dy } of template) {
      const other = this.#resolve(origin.x + dx, origin.y + dy);
      if (!other) continue;
      if (other === origin && !(includeSelf && dx === 0 && dy === 0)) continue;
      if (seen) {
        if (seen.has(other)) continue;
        seen.add(other);
      }
      result.push(other);
    }
    return result;
  }
}
