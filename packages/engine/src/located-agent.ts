// SPDX-License-Identifier: EPL-2.0
import { Agent } from './agent';
import type { FindOptions, Point, Space } from './space/space';

/** Engine-internal: writes a position without notifying the space. Not part of the public API. */
export let writePosition: (agent: LocatedAgent, x: number, y: number) => void;

/** Engine-internal: whether the agent has been given a position. Not part of the public API. */
export let hasPosition: (agent: LocatedAgent) => boolean;

/**
 * An agent with a place in the space of its scape.
 *
 * Its methods ask the space about the agent's surroundings without naming a
 * topology, so the same agent code runs on a lattice, in a list, on a graph
 * and in a continuous space: `findWithin(2)` is the cells two steps away on a
 * lattice, and the agents within a distance of 2 in a continuous space.
 *
 * `x` and `y` are read-only. A lattice sets them when it creates the agent;
 * in a continuous space the agent moves itself with {@link moveTo} or
 * {@link moveBy}, and one created without a position is placed at a random
 * point when it joins.
 */
export class LocatedAgent extends Agent {
  #x = 0;
  #y = 0;
  #placed = false;

  static {
    writePosition = (agent, x, y) => {
      agent.#x = x;
      agent.#y = y;
      agent.#placed = true;
    };
    hasPosition = (agent) => agent.#placed;
  }

  /** Optionally gives the agent an initial position, which is kept when it joins a scape. */
  constructor(x?: number, y?: number) {
    super();
    if (x !== undefined && y !== undefined) {
      this.#x = x;
      this.#y = y;
      this.#placed = true;
    }
  }

  /** Column on a lattice, from 0 at the left; horizontal position in a continuous space. */
  get x(): number {
    return this.#x;
  }

  /** Row on a lattice, from 0 at the top; vertical position in a continuous space. */
  get y(): number {
    return this.#y;
  }

  /** The other members of this agent's scape within a distance, in the space's own measure and order. */
  findWithin(distance: number, options?: FindOptions<this>): this[] {
    return this.#space().findWithin(this, distance, options);
  }

  /** The number of other members of this agent's scape within a distance. */
  countWithin(distance: number, options?: FindOptions<this>): number {
    return this.#space().countWithin(this, distance, options);
  }

  /** The nearest other member of this agent's scape, optionally satisfying a condition and within a distance. */
  findNearest(condition?: (agent: this) => boolean, maxDistance?: number): this | undefined {
    return this.#space().findNearest(this, condition, maxDistance);
  }

  /** The member within a distance for which `value` is greatest, random among equals. */
  findMaximumWithin(
    value: (agent: this) => number,
    distance: number,
    options?: FindOptions<this>,
  ): this | undefined {
    return this.#space().findMaximumWithin(this, value, distance, options);
  }

  /** The member within a distance for which `value` is least, random among equals. */
  findMinimumWithin(
    value: (agent: this) => number,
    distance: number,
    options?: FindOptions<this>,
  ): this | undefined {
    return this.#space().findMinimumWithin(this, value, distance, options);
  }

  /** The distance to another member of this agent's scape, in the space's own measure. */
  distanceTo(other: this): number {
    return this.#space().distance(this, other);
  }

  /** Moves to a position. The space wraps or clamps it into its bounds. */
  moveTo(x: number, y: number): void {
    if (this.alive) this.#space().moveTo(this, x, y);
    else writePosition(this, x, y);
  }

  /** Moves by an offset. The agent must already have a position. */
  moveBy(dx: number, dy: number): void {
    if (!this.#placed) throw new Error('Agent has no position yet');
    this.moveTo(this.#x + dx, this.#y + dy);
  }

  /** Moves toward a target by at most `distance`, never past it. Returns the distance moved. */
  moveToward(target: Point, distance: number): number {
    return this.#space().moveToward(this, target, distance);
  }

  /** Moves directly away from a target by `distance`. Returns the distance moved. */
  moveAway(target: Point, distance: number): number {
    return this.#space().moveAway(this, target, distance);
  }

  #space(): Space<this> {
    return this.scape.space as unknown as Space<this>;
  }
}
