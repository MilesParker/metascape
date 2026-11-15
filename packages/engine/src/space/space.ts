// SPDX-License-Identifier: EPL-2.0
import type { Agent } from '../agent';
import type { Random } from '../random';
import type { Scape } from '../scape';

/** A plain point, accepted wherever a position is needed. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A vector between two points. */
export interface Displacement {
  readonly dx: number;
  readonly dy: number;
}

/** The dimensions of a space: a count, or a width and a height. */
export type Extent = number | readonly [width: number, height: number];

/** The kinds of space, so that tools can tell how to draw a scape. */
export type Geometry = 'list' | 'singleton' | 'array2d' | 'graph' | 'continuous2d';

/** What a scape tells its space when it takes it. */
export interface SpaceSetup {
  readonly extent: Extent | undefined;
  readonly periodic: boolean | undefined;
  readonly size: number | undefined;
}

/** Options of the searches every space offers. */
export interface FindOptions<A> {
  /** Include the origin itself. Default false. */
  readonly includeSelf?: boolean;
  /** Only agents for which this returns true are found. */
  readonly condition?: (agent: A) => boolean;
}

/**
 * The topology of a scape: where its members are in relation to each other.
 *
 * A scape holds one space and can be given any other in its place. Agents
 * never name a topology: they ask for what is within a distance, what is
 * nearest, a random neighbor, and the space answers in its own terms. A
 * distance is cells on a lattice, places in a list, links in a graph and
 * length in a continuous space.
 *
 * Everything here that picks at random uses the random stream of the space's
 * scape.
 */
export abstract class Space<A extends Agent = Agent> {
  abstract readonly geometry: Geometry;

  #scape: Scape<A> | undefined;
  #periodic = true;

  /** The scape whose members this space arranges. */
  get scape(): Scape<A> {
    if (!this.#scape) throw new Error('This space has not been given to a scape');
    return this.#scape;
  }

  /** The random stream of the space's scape. */
  get random(): Random {
    return this.scape.random;
  }

  /** The live members of the space's scape. */
  get members(): readonly A[] {
    return this.scape.members;
  }

  /** Whether the edges of the space join up. */
  get periodic(): boolean {
    return this.#periodic;
  }

  /** The dimensions of the space. For a space without dimensions of its own, the number of members. */
  get extent(): readonly number[] {
    return [this.scape.size];
  }

  /** Whether a member that hosts occupants may hold more than one. */
  get multiOccupancy(): boolean {
    return false;
  }

  /** Whether the space decides its own membership, so that members cannot be added or removed. */
  get fixedMembership(): boolean {
    return false;
  }

  /** Called by a scape when it takes this space. A space serves one scape. */
  attach(scape: Scape<A>, setup: SpaceSetup): void {
    if (this.#scape) throw new Error(`This space already belongs to scape "${this.#scape.name}"`);
    this.#scape = scape;
    this.#periodic = setup.periodic ?? true;
    this.configure(setup);
  }

  /** Hook for subclasses: reads the extent and size the scape was given. */
  protected configure(_setup: SpaceSetup): void {}

  /** Creates the initial members. Called once, when the model is created. */
  abstract populate(): void;

  /** Hook: an agent has joined the scape. Runs before the agent is initialized. */
  added(_agent: A): void {}

  /** Hook: an agent has left the scape. Runs before `agent.removed()`. */
  removed(_agent: A): void {}

  /** The members next to an agent. Treat the array as read-only. */
  abstract neighbors(agent: A): readonly A[];

  /** The distance between two members, in the space's own measure. */
  abstract distance(a: A, b: A): number;

  /** The members within a distance of an agent, in an order the space defines. */
  abstract findWithin(origin: A, distance: number, options?: FindOptions<A>): A[];

  /** The number of members within a distance of an agent. */
  countWithin(origin: A, distance: number, options?: FindOptions<A>): number {
    return this.findWithin(origin, distance, options).length;
  }

  /** Whether any member is within a distance of an agent. */
  hasWithin(origin: A, distance: number, options?: FindOptions<A>): boolean {
    return this.countWithin(origin, distance, options) > 0;
  }

  /**
   * The nearest other member satisfying `condition`, no farther than
   * `maxDistance`. Ties are broken uniformly at random.
   */
  findNearest(origin: A, condition?: (agent: A) => boolean, maxDistance = Infinity): A | undefined {
    let best = Infinity;
    let found: A[] = [];
    for (const other of this.members) {
      if (other === origin || (condition && !condition(other))) continue;
      const d = this.distance(origin, other);
      if (d > maxDistance || d > best) continue;
      if (d < best) {
        best = d;
        found = [other];
      } else {
        found.push(other);
      }
    }
    return found.length === 0 ? undefined : this.random.pick(found);
  }

  /**
   * The member within a distance of an agent for which `value` is greatest.
   * Ties are broken uniformly at random. `undefined` if there is none.
   */
  findMaximumWithin(
    origin: A,
    value: (agent: A) => number,
    distance: number,
    options?: FindOptions<A>,
  ): A | undefined {
    return this.#extreme(origin, value, distance, options, 1);
  }

  /** The member within a distance of an agent for which `value` is least. See {@link findMaximumWithin}. */
  findMinimumWithin(
    origin: A,
    value: (agent: A) => number,
    distance: number,
    options?: FindOptions<A>,
  ): A | undefined {
    return this.#extreme(origin, value, distance, options, -1);
  }

  /** A uniformly chosen neighbor of an agent, optionally among those satisfying a condition. */
  findRandomNeighbor(agent: A, condition?: (agent: A) => boolean): A | undefined {
    const neighbors = this.neighbors(agent);
    const candidates = condition ? neighbors.filter(condition) : neighbors;
    return candidates.length === 0 ? undefined : this.random.pick(candidates);
  }

  /**
   * The neighbor of `from` that brings it closest to `to` (random among
   * equals), or `undefined` if no neighbor is closer than `from` itself.
   */
  toward(from: A, to: A): A | undefined {
    return this.#step(from, to, -1);
  }

  /**
   * The neighbor of `from` that takes it farthest from `to` (random among
   * equals), or `undefined` if no neighbor is farther than `from` itself.
   */
  away(from: A, to: A): A | undefined {
    return this.#step(from, to, 1);
  }

  /** Moves an agent to a position. Only spaces whose members have positions of their own allow it. */
  moveTo(_agent: A, _x: number, _y: number): void {
    throw new Error(`A ${this.geometry} space does not let its members move to a position`);
  }

  /**
   * Moves an agent toward a target, by at most `distance` in the space's
   * measure. Returns the distance moved.
   */
  moveToward(_agent: A, _target: Point, _distance: number): number {
    throw new Error(`A ${this.geometry} space does not let its members move`);
  }

  /** Moves an agent away from a target by `distance`. Returns the distance moved. */
  moveAway(_agent: A, _target: Point, _distance: number): number {
    throw new Error(`A ${this.geometry} space does not let its members move`);
  }

  #step(from: A, to: A, sign: 1 | -1): A | undefined {
    let best = this.distance(from, to);
    let candidates: A[] = [];
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

  #extreme(
    origin: A,
    value: (agent: A) => number,
    distance: number,
    options: FindOptions<A> | undefined,
    sign: 1 | -1,
  ): A | undefined {
    let best = -Infinity;
    let found: A[] = [];
    for (const other of this.findWithin(origin, distance, options)) {
      const v = value(other) * sign;
      if (v < best) continue;
      if (v > best) {
        best = v;
        found = [other];
      } else {
        found.push(other);
      }
    }
    return found.length === 0 ? undefined : this.random.pick(found);
  }
}

/** The number of members a size or extent asks for. */
export function memberCount(setup: SpaceSetup): number {
  const { size, extent } = setup;
  if (size !== undefined) return size;
  if (extent === undefined) return 0;
  return typeof extent === 'number' ? extent : extent[0] * extent[1];
}

/** The width and height an extent gives, or `undefined` if it gives none. */
export function dimensions(extent: Extent | undefined): readonly [number, number] | undefined {
  return typeof extent === 'number' || extent === undefined ? undefined : extent;
}
