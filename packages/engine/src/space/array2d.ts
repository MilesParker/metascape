// SPDX-License-Identifier: EPL-2.0
import { HostCell, type Cell } from '../cell';
import { writePosition } from '../located-agent';
import {
  dimensions,
  Space,
  type FindOptions,
  type Geometry,
  type Point,
  type SpaceSetup,
} from './space';

/** Which cells count as neighbors: the 8 surrounding cells, or the 4 orthogonal ones. */
export type Neighborhood = 'moore' | 'vonNeumann';

/** How distance between cells is measured. */
export type Metric = 'chebyshev' | 'manhattan' | 'euclidean';

/** Options of {@link Array2D.findWithin}. */
export interface WithinOptions<C> extends FindOptions<C> {
  /** Default: the lattice's natural metric (chebyshev for moore, manhattan for vonNeumann). */
  readonly metric?: Metric;
}

export interface Array2DOptions {
  /** Allow several occupants on one cell. Default false. */
  readonly multiOccupancy?: boolean;
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
 * A fixed lattice of `width` x `height` cells, in a torus (`periodic`, the
 * default) or with hard edges. The scape's extent gives the width and height.
 * Coordinates start at the top left; y grows downward.
 *
 * Cells are created in row-major order when the model populates the scape
 * (y outer loop, x inner), so `members[y * width + x]` is the cell at (x, y);
 * the prototype agent is given that index. Without a prototype agent the
 * cells are plain host cells. Membership is fixed afterwards: cells cannot be
 * added or removed.
 *
 * Use {@link Array2DMoore} or {@link Array2DVonNeumann}; they differ only in
 * which cells are neighbors and so in how distance is measured.
 */
export abstract class Array2D<C extends Cell = Cell> extends Space<C> {
  readonly geometry: Geometry = 'array2d';
  abstract readonly neighborhood: Neighborhood;

  readonly #multiOccupancy: boolean;
  #width = 0;
  #height = 0;
  readonly #cells: C[] = [];
  readonly #neighborCache: (readonly C[] | undefined)[] = [];
  readonly #templates = new Map<string, readonly Offset[]>();
  /** The rays of each cell, by range in whole steps. */
  readonly #rayCache = new Map<number, (readonly C[] | undefined)[]>();
  #populated = false;

  constructor(options: Array2DOptions = {}) {
    super();
    this.#multiOccupancy = options.multiOccupancy ?? false;
  }

  protected override configure(setup: SpaceSetup): void {
    const [width, height] = dimensions(setup.extent) ?? [Number.NaN, Number.NaN];
    for (const [label, value] of [
      ['width', width],
      ['height', height],
    ] as const) {
      if (!Number.isInteger(value) || value < 1) {
        throw new RangeError(
          `Scape "${this.scape.name}": the ${label} of its extent must be a positive integer`,
        );
      }
    }
    this.#width = width;
    this.#height = height;
  }

  /** Number of columns. */
  get width(): number {
    return this.#width;
  }

  /** Number of rows. */
  get height(): number {
    return this.#height;
  }

  override get extent(): readonly number[] {
    return [this.#width, this.#height];
  }

  override get multiOccupancy(): boolean {
    return this.#multiOccupancy;
  }

  override get fixedMembership(): boolean {
    return true;
  }

  /** The metric used when none is given: chebyshev for moore, manhattan for vonNeumann. */
  get defaultMetric(): Metric {
    return this.neighborhood === 'moore' ? 'chebyshev' : 'manhattan';
  }

  /** Creates every cell, in row-major order. Called by the model. */
  populate(): void {
    if (this.#populated) throw new Error(`Scape "${this.scape.name}" is already populated`);
    this.#populated = true;
    const scape = this.scape;
    const prototypeAgent = scape.prototypeAgent;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = prototypeAgent
          ? prototypeAgent(y * this.width + x)
          : (new HostCell() as unknown as C);
        writePosition(cell, x, y);
        this.#cells.push(cell);
        scape.add(cell);
      }
    }
  }

  /**
   * The cell at (x, y). With `periodic`, coordinates wrap around the edges; without,
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

  /**
   * Replaces the neighbors of a cell, for lattices whose wiring is not a plain
   * neighborhood (see {@link wireSmallWorld}). Everything that reads
   * neighbors, including `cell.neighbors`, sees the new list. The list
   * may be one-way and may include the cell itself.
   */
  setNeighbors(cell: C, neighbors: readonly C[]): void {
    for (const other of neighbors) this.#indexOf(other);
    this.#neighborCache[this.#indexOf(cell)] = Object.freeze([...neighbors]);
  }

  /** Distance between two cells (or any two positions), the shortest way round on a torus. */
  distance(a: Point, b: Point, metric: Metric = this.defaultMetric): number {
    let dx = Math.abs(a.x - b.x);
    let dy = Math.abs(a.y - b.y);
    if (this.periodic) {
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
  findWithin(cell: C, radius: number, options: WithinOptions<C> = {}): C[] {
    const metric = options.metric ?? this.defaultMetric;
    const includeSelf = options.includeSelf ?? false;
    this.#indexOf(cell);
    const template = this.#withinTemplate(metric, radius);
    const found = this.#collect(cell, template, includeSelf, this.#needsDedupe(radius));
    return options.condition ? found.filter(options.condition) : found;
  }

  /**
   * "Line of sight": the cells in each neighborhood direction (4 for
   * vonNeumann, 8 for moore) up to `range` steps away, nearest first,
   * direction by direction in the order of {@link neighbors}. The origin is
   * never included and no cell is listed twice (relevant on small tori).
   * Computed once per cell and range.
   */
  rays(cell: C, range: number): readonly C[] {
    const index = this.#indexOf(cell);
    const steps = Math.floor(range);
    let byCell = this.#rayCache.get(steps);
    if (!byCell) this.#rayCache.set(steps, (byCell = []));
    let cached = byCell[index];
    if (!cached) {
      cached = Object.freeze(this.#rays(cell, steps)) as readonly C[];
      byCell[index] = cached;
    }
    return cached;
  }

  #rays(cell: C, steps: number): C[] {
    const result: C[] = [];
    const seen = new Set<C>([cell]);
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
  override findNearest(
    cell: C,
    condition: (cell: C) => boolean = () => true,
    maxRadius = Infinity,
  ): C | undefined {
    this.#indexOf(cell);
    const manhattan = this.defaultMetric === 'manhattan';
    const limit = Math.min(
      Math.floor(maxRadius),
      this.periodic
        ? manhattan
          ? Math.floor(this.width / 2) + Math.floor(this.height / 2)
          : Math.floor(Math.max(this.width, this.height) / 2)
        : manhattan
          ? this.width + this.height - 2
          : Math.max(this.width, this.height) - 1,
    );
    for (let radius = 1; radius <= limit; radius++) {
      const ring = this.#ringTemplate(radius);
      const found = this.#collect(cell, ring, false, this.periodic).filter(condition);
      if (found.length > 0) return this.random.pick(found);
    }
    return undefined;
  }

  /** A uniformly chosen cell without occupants, if there is one. */
  findRandomAvailable(): C | undefined {
    return this.scape.findRandom((cell) => cell.isAvailable);
  }

  #indexOf(cell: Cell): number {
    const index = cell.y * this.width + cell.x;
    if (this.#cells[index] !== (cell as unknown as C)) {
      throw new Error(`Cell is not a member of scape "${this.scape.name}"`);
    }
    return index;
  }

  #resolve(x: number, y: number): C | undefined {
    if (this.periodic) {
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
    return this.periodic
      ? {
          rx: Math.min(r, Math.floor(this.width / 2)),
          ry: Math.min(r, Math.floor(this.height / 2)),
        }
      : { rx: Math.min(r, this.width - 1), ry: Math.min(r, this.height - 1) };
  }

  /** Whether distinct offsets can land on the same cell. */
  #needsDedupe(radius: number): boolean {
    if (!this.periodic) return false;
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

/** A lattice whose cells have the 8 surrounding cells as neighbors. Distance is the larger of the row and column differences. */
export class Array2DMoore<C extends Cell = Cell> extends Array2D<C> {
  readonly neighborhood: Neighborhood = 'moore';
}

/** A lattice whose cells have the 4 orthogonal cells as neighbors. Distance is the sum of the row and column differences. */
export class Array2DVonNeumann<C extends Cell = Cell> extends Array2D<C> {
  readonly neighborhood: Neighborhood = 'vonNeumann';
}
