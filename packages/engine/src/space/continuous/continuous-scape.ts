// SPDX-License-Identifier: EPL-2.0
import { Scape, type ScapeOptions } from '../../scape';
import { hasPosition, writePosition, type PointAgent } from './point-agent';

/** A plain point, accepted wherever an agent's position is needed. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A vector between two points. */
export interface Displacement {
  readonly dx: number;
  readonly dy: number;
}

export interface ContinuousScapeOptions<A extends PointAgent> extends ScapeOptions<A> {
  /** Width of the rectangle; positions are in [0, width). */
  readonly width: number;
  /** Height of the rectangle; positions are in [0, height). */
  readonly height: number;
  /** True (default) for a torus; false clamps positions to the rectangle. */
  readonly wrap?: boolean;
  /** Edge length hint for the spatial index. Default: a sixteenth of the shorter side. */
  readonly cellSize?: number;
}

const MAX_CELLS_PER_AXIS = 1024;

/** The largest value below `limit`, used to keep clamped positions inside [0, limit). */
function justBelow(limit: number): number {
  return limit - Math.max(limit * Number.EPSILON, Number.MIN_VALUE);
}

/**
 * A rectangular continuous space `[0, width) x [0, height)`, by default a torus.
 *
 * Neighbor queries use a uniform-grid index that follows agents as they move,
 * join and die. Query results are always in ascending agent `id` order.
 */
export class ContinuousScape<A extends PointAgent = PointAgent> extends Scape<A> {
  readonly width: number;
  readonly height: number;
  readonly wrap: boolean;

  readonly #cols: number;
  readonly #rows: number;
  readonly #cells: Set<A>[];
  readonly #cellOf = new Map<A, number>();

  constructor(options: ContinuousScapeOptions<A>) {
    super(options);
    const { width, height } = options;
    if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
      throw new RangeError(`Scape "${this.name}": width and height must be positive and finite`);
    }
    const cellSize = options.cellSize ?? Math.min(width, height) / 16;
    if (!(cellSize > 0) || !Number.isFinite(cellSize)) {
      throw new RangeError(`Scape "${this.name}": cellSize must be positive and finite`);
    }
    this.width = width;
    this.height = height;
    this.wrap = options.wrap ?? true;
    this.#cols = Math.max(1, Math.min(MAX_CELLS_PER_AXIS, Math.floor(width / cellSize)));
    this.#rows = Math.max(1, Math.min(MAX_CELLS_PER_AXIS, Math.floor(height / cellSize)));
    this.#cells = Array.from({ length: this.#cols * this.#rows }, () => new Set<A>());
  }

  /** Wraps (torus) or clamps (bounded) a point into the rectangle. */
  normalize(x: number, y: number): Point {
    return { x: this.#normalizeAxis(x, this.width), y: this.#normalizeAxis(y, this.height) };
  }

  /** A uniformly random point in the rectangle, drawn from this scape's random stream. */
  randomPoint(): Point {
    const random = this.random;
    return { x: random.float() * this.width, y: random.float() * this.height };
  }

  /** The shortest vector from one point to another, taking the wrap into account. */
  displacement(from: Point, to: Point): Displacement {
    let dx = to.x - from.x;
    let dy = to.y - from.y;
    if (this.wrap) {
      dx -= this.width * Math.round(dx / this.width);
      dy -= this.height * Math.round(dy / this.height);
    }
    return { dx, dy };
  }

  /** The length of the shortest vector between two points. */
  distance(a: Point, b: Point): number {
    const { dx, dy } = this.displacement(a, b);
    return Math.hypot(dx, dy);
  }

  /** The direction from one point to another in radians, as `atan2(dy, dx)`. */
  heading(from: Point, to: Point): number {
    const { dx, dy } = this.displacement(from, to);
    return Math.atan2(dy, dx);
  }

  /**
   * All other live agents within `radius` (inclusive) of an agent or point,
   * in ascending `id` order. An agent origin is never part of the result.
   */
  within(origin: Point, radius: number, condition?: (agent: A) => boolean): A[] {
    const found = this.#collect(origin, radius, condition);
    return found.sort((a, b) => a.id - b.id);
  }

  /** The number of other live agents within `radius` of an agent or point. */
  countWithin(origin: Point, radius: number, condition?: (agent: A) => boolean): number {
    return this.#collect(origin, radius, condition).length;
  }

  /**
   * The nearest other live agent, optionally matching a condition and within
   * `maxRadius`. Exact ties go to the lowest `id`. `undefined` if there is none.
   */
  nearest(origin: Point, condition?: (agent: A) => boolean, maxRadius?: number): A | undefined {
    const limit = Math.min(
      maxRadius ?? Infinity,
      this.wrap ? Math.hypot(this.width, this.height) / 2 : Math.hypot(this.width, this.height),
    );
    if (!(limit >= 0)) return undefined;
    let radius = Math.min(limit, Math.min(this.width / this.#cols, this.height / this.#rows));
    for (;;) {
      let best: A | undefined;
      let bestDistance = Infinity;
      for (const agent of this.#collect(origin, radius, condition)) {
        const d = this.distance(origin, agent);
        if (d < bestDistance || (d === bestDistance && best !== undefined && agent.id < best.id)) {
          best = agent;
          bestDistance = d;
        }
      }
      if (best || radius >= limit) return best;
      radius = Math.min(limit, radius * 2);
    }
  }

  /**
   * Moves an agent toward a target along the shortest path, by at most
   * `distance` and never past the target. Returns the distance moved.
   */
  moveToward(agent: A, target: Point, distance: number): number {
    const { dx, dy } = this.displacement(agent, target);
    const length = Math.hypot(dx, dy);
    if (length <= distance) {
      agent.moveTo(agent.x + dx, agent.y + dy);
      return length;
    }
    agent.moveBy((dx / length) * distance, (dy / length) * distance);
    return distance;
  }

  /** Moves an agent directly away from a target by `distance`. Returns the distance moved. */
  moveAway(agent: A, target: Point, distance: number): number {
    const { dx, dy } = this.displacement(agent, target);
    const length = Math.hypot(dx, dy);
    if (length === 0) return 0;
    agent.moveBy((-dx / length) * distance, (-dy / length) * distance);
    return distance;
  }

  /** Moves an agent to a point (normalized) and updates the index. Used by `PointAgent.moveTo`. */
  relocate(agent: A, x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new RangeError(`Cannot move to (${x}, ${y})`);
    }
    const point = this.normalize(x, y);
    writePosition(agent, point.x, point.y);
    if (agent.alive) this.#index(agent);
  }

  protected override onAdded(agent: A): void {
    const point = hasPosition(agent) ? this.normalize(agent.x, agent.y) : this.randomPoint();
    writePosition(agent, point.x, point.y);
    this.#index(agent);
  }

  protected override onRemoved(agent: A): void {
    const cell = this.#cellOf.get(agent);
    if (cell !== undefined) this.#cells[cell]?.delete(agent);
    this.#cellOf.delete(agent);
  }

  #normalizeAxis(value: number, extent: number): number {
    if (this.wrap) {
      const wrapped = ((value % extent) + extent) % extent;
      return wrapped >= extent ? 0 : wrapped;
    }
    return Math.min(Math.max(value, 0), justBelow(extent));
  }

  #index(agent: A): void {
    const col = Math.min(this.#cols - 1, Math.floor((agent.x / this.width) * this.#cols));
    const row = Math.min(this.#rows - 1, Math.floor((agent.y / this.height) * this.#rows));
    const cell = row * this.#cols + col;
    const previous = this.#cellOf.get(agent);
    if (previous === cell) return;
    if (previous !== undefined) this.#cells[previous]?.delete(agent);
    this.#cells[cell]?.add(agent);
    this.#cellOf.set(agent, cell);
  }

  /** Cell indices along one axis that can hold points within `radius` of `origin`. */
  #axisCells(origin: number, radius: number, extent: number, count: number): number[] {
    const size = extent / count;
    const pad = radius + size * 1e-9;
    const all = (): number[] => Array.from({ length: count }, (_, i) => i);
    if (!Number.isFinite(pad)) return this.wrap || origin >= 0 ? all() : [];
    let lo = Math.floor((origin - pad) / size);
    let hi = Math.floor((origin + pad) / size);
    if (this.wrap) {
      if (hi - lo + 1 >= count) return all();
      const cells: number[] = [];
      for (let i = lo; i <= hi; i++) cells.push(((i % count) + count) % count);
      return cells;
    }
    lo = Math.max(0, lo);
    hi = Math.min(count - 1, hi);
    const cells: number[] = [];
    for (let i = lo; i <= hi; i++) cells.push(i);
    return cells;
  }

  /** Matching agents within the radius, in no particular order. */
  #collect(origin: Point, radius: number, condition?: (agent: A) => boolean): A[] {
    const found: A[] = [];
    if (!(radius >= 0)) return found;
    const cols = this.#axisCells(origin.x, radius, this.width, this.#cols);
    const rows = this.#axisCells(origin.y, radius, this.height, this.#rows);
    for (const row of rows) {
      for (const col of cols) {
        for (const agent of this.#cells[row * this.#cols + col] ?? []) {
          if (agent === origin) continue;
          if (this.distance(origin, agent) > radius) continue;
          if (condition && !condition(agent)) continue;
          found.push(agent);
        }
      }
    }
    return found;
  }
}
