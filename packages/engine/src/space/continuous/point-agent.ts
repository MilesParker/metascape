// SPDX-License-Identifier: EPL-2.0
import { Agent } from '../../agent';
import type { ContinuousScape } from './continuous-scape';

/** Engine-internal: writes a position without notifying the space. Not part of the public API. */
export let writePosition: (agent: PointAgent, x: number, y: number) => void;

/** Engine-internal: whether the agent has been given a position. Not part of the public API. */
export let hasPosition: (agent: PointAgent) => boolean;

/**
 * An agent with a position in a {@link ContinuousScape}.
 *
 * `x` and `y` are read-only; move the agent with {@link moveTo} or
 * {@link moveBy} so that the space can keep its spatial index up to date.
 * An agent created without a position is placed at a random point when it
 * joins its scape.
 */
export class PointAgent extends Agent {
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

  get x(): number {
    return this.#x;
  }

  get y(): number {
    return this.#y;
  }

  /** Moves to a point. The scape wraps or clamps it into the rectangle. */
  moveTo(x: number, y: number): void {
    if (this.alive) {
      const scape = this.scape as unknown as Partial<ContinuousScape>;
      if (typeof scape.relocate !== 'function') {
        throw new Error('PointAgent must belong to a ContinuousScape to move');
      }
      scape.relocate(this, x, y);
    } else {
      writePosition(this, x, y);
    }
  }

  /** Moves by an offset. The agent must already have a position. */
  moveBy(dx: number, dy: number): void {
    if (!this.#placed) throw new Error('PointAgent has no position yet');
    this.moveTo(this.#x + dx, this.#y + dy);
  }
}
