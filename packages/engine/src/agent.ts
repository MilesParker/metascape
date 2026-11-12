// SPDX-License-Identifier: EPL-2.0
import type { Random } from './random';
import type { Scape } from './scape';
import type { Simulation } from './simulation';

/** Engine-internal: makes an agent a live member of a scape. Not part of the public API. */
export let joinScape: (agent: Agent, scape: Scape<Agent>, id: number) => void;

/** Engine-internal: marks an agent as removed. Not part of the public API. */
export let leaveScape: (agent: Agent) => void;

/**
 * Base class for everything that lives in a {@link Scape}.
 *
 * Model agents extend this class and add their own state and behaviour:
 *
 * ```ts
 * class Bug extends Agent {
 *   energy = 10;
 *   override initialize() { this.energy = this.random.int(5, 15); }
 * }
 * ```
 *
 * An agent belongs to exactly one scape, which sets {@link id}, {@link scape}
 * and {@link alive} when the agent is added.
 *
 * Subclasses may override the hooks `initialize` and `removed`, but must not
 * reuse the names `id`, `alive`, `scape`, `sim`, `random` or `die` for their
 * own members. In particular, name a model's own life flag something else,
 * such as `on` or `living`, rather than `alive`.
 */
export class Agent {
  #id = -1;
  #alive = false;
  #scape: Scape<Agent> | undefined;

  static {
    joinScape = (agent, scape, id) => {
      agent.#scape = scape;
      agent.#id = id;
      agent.#alive = true;
    };
    leaveScape = (agent) => {
      agent.#alive = false;
    };
  }

  /** Unique within a simulation, assigned in order of creation. -1 until added to a scape. */
  get id(): number {
    return this.#id;
  }

  /** False before the agent joins a scape and after it is removed. */
  get alive(): boolean {
    return this.#alive;
  }

  /** The scape this agent is, or was, a member of. Throws before the agent is added. */
  get scape(): Scape<Agent> {
    if (!this.#scape) throw new Error('Agent has not been added to a scape yet');
    return this.#scape;
  }

  /** The simulation this agent is part of. */
  get sim(): Simulation {
    return this.scape.sim;
  }

  /**
   * The random stream to use for all of this agent's random choices.
   * Never use `Math.random()` in a model: it breaks reproducibility.
   */
  get random(): Random {
    return this.scape.random;
  }

  /**
   * Called once when the agent joins the simulation: for the initial
   * population after every scape has been populated (so other scapes can be
   * queried), and immediately for agents added while the simulation runs.
   */
  initialize(): void {}

  /** Called once when the agent is removed from its scape. */
  removed(): void {}

  /** Removes this agent from its scape. Safe to call more than once and during a step. */
  die(): void {
    if (this.#alive) this.scape.remove(this);
  }
}
