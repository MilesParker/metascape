// SPDX-License-Identifier: EPL-2.0
import type { Random } from './random';
import type { RootScape } from './root';
import type { Rule } from './rule';
import type { Scape } from './scape';

/** Engine-internal: makes an agent a live member of its parent scape. Not part of the public API. */
export let joinScape: (agent: Agent, scape: Scape<Agent>, id: number) => void;

/** Engine-internal: marks an agent as removed from the model. Not part of the public API. */
export let leaveScape: (agent: Agent) => void;

/** Engine-internal: records that an agent is also a member of a scape that is not its parent. */
export let enrol: (agent: Agent, scape: Scape<Agent>) => void;

/** Engine-internal: undoes {@link enrol}. Returns whether the agent was enrolled. */
export let withdraw: (agent: Agent, scape: Scape<Agent>) => boolean;

/** Engine-internal: whether an agent is a live member of a scape, as parent or otherwise. */
export let isMember: (agent: Agent, scape: Scape<Agent>) => boolean;

/** Engine-internal: the scapes an agent belongs to besides its parent. */
export let otherScapes: (agent: Agent) => readonly Scape<Agent>[];

/** Engine-internal: makes a root scape live without a parent. */
export let enthrone: (root: Agent) => void;

/**
 * Base class for everything in a model: the things in a scape, and the scapes
 * themselves.
 *
 * Model agents extend this class (or {@link Cell}, {@link HostCell},
 * {@link CellOccupant}) and add their own state and behaviour:
 *
 * ```ts
 * class Bug extends Agent {
 *   energy = 10;
 *   override initialize() { this.energy = this.random.int(5, 15); }
 * }
 * ```
 *
 * An agent has one parent scape, its behavioural context, which sets
 * {@link id}, {@link scape} and {@link alive} when the agent is added. It may
 * be a member of further scapes as well (see {@link Scape.add}).
 *
 * Subclasses may override the hooks `initialize` and `removed`, but must not
 * reuse the names `id`, `alive`, `scape`, `root`, `random` or `die` for their
 * own members. In particular, name a model's own life flag something else,
 * such as `on` or `living`, rather than `alive`.
 */
export class Agent {
  #id = -1;
  #alive = false;
  #scape: Scape<Agent> | undefined;
  #others: Set<Scape<Agent>> | undefined;

  static {
    joinScape = (agent, scape, id) => {
      agent.#scape = scape;
      agent.#id = id;
      agent.#alive = true;
    };
    leaveScape = (agent) => {
      agent.#alive = false;
      agent.#others = undefined;
    };
    enrol = (agent, scape) => {
      (agent.#others ??= new Set()).add(scape);
    };
    withdraw = (agent, scape) => agent.#others?.delete(scape) ?? false;
    isMember = (agent, scape) =>
      agent.#alive && (agent.#scape === scape || (agent.#others?.has(scape) ?? false));
    otherScapes = (agent) => (agent.#others ? [...agent.#others] : []);
    enthrone = (root) => {
      root.#id = 0;
      root.#alive = true;
    };
  }

  /**
   * Unique among the agents of a model that are not scapes, assigned in order
   * of joining; scapes are numbered separately. -1 until added to a scape.
   */
  get id(): number {
    return this.#id;
  }

  /** False before the agent joins a scape and after it is removed. */
  get alive(): boolean {
    return this.#alive;
  }

  /**
   * The parent scape: the one this agent was added to as its behavioural
   * context, or was last removed from. Throws before the agent is added.
   */
  get scape(): Scape<Agent> {
    if (!this.#scape) throw new Error('Agent has not been added to a scape yet');
    return this.#scape;
  }

  /** The root scape of the model this agent is part of. */
  get root(): RootScape {
    return this.scape.root;
  }

  /**
   * The random stream to use for all of this agent's random choices: that of
   * its parent scape. Never use `Math.random()` in a model: it breaks
   * reproducibility.
   */
  get random(): Random {
    return this.scape.random;
  }

  /**
   * Called once when the agent joins the model: for the initial population
   * after every scape has been populated (so other scapes can be queried),
   * and immediately for agents added while the model runs.
   */
  initialize(): void {}

  /** Called once when the agent is removed from its parent scape. */
  removed(): void {}

  /** Executes a rule on this agent alone. */
  execute(rule: Rule<this>): void {
    rule.execute(this);
  }

  /** Removes this agent from the model. Safe to call more than once and during an iteration. */
  die(): void {
    if (this.#alive) this.scape.remove(this);
  }
}
