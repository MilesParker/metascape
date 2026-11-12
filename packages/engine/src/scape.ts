// SPDX-License-Identifier: EPL-2.0
import { joinScape, leaveScape, type Agent } from './agent';
import type { Random } from './random';
import type { Simulation } from './simulation';

/**
 * A behaviour applied to the members of a scape.
 *
 * A rule with only `execute` acts immediately. A rule that also has `update`
 * is two-phase: within a step, `execute` runs for every agent before `update`
 * runs for any. Compute the next state in `execute` and apply it in `update`
 * to get synchronous updating that does not depend on agent order.
 */
export interface Rule<A extends Agent = Agent> {
  readonly name: string;
  execute(agent: A): void;
  update?(agent: A): void;
}

/** A rule installed on a scape, which can be switched off without removing it. */
export interface RuleEntry<A extends Agent = Agent> {
  readonly rule: Rule<A>;
  enabled: boolean;
}

/** The order in which a scape's members are visited within a step. */
export type VisitOrder = 'shuffled' | 'sequential';

/**
 * How rules and agents are interleaved within a step.
 * - `byAgent`: each agent executes all rules before the next agent starts.
 * - `byRule`: each rule is executed by all agents before the next rule starts.
 */
export type Schedule = 'byAgent' | 'byRule';

/**
 * Which members act in a step when {@link ScapeOptions.activations} is set.
 * - `tour`: distinct members, chosen without replacement.
 * - `draw`: independent random draws, so a member may act more than once.
 */
export type Sampling = 'tour' | 'draw';

export interface ScapeOptions<A extends Agent> {
  /** Unique within the simulation. */
  readonly name: string;
  /** Creates one member. Required if `size` is greater than zero or `spawn()` is used. */
  readonly create?: (index: number) => A;
  /** Initial population. Default 0. */
  readonly size?: number;
  /** Default `shuffled`: a fresh random order every step. */
  readonly order?: VisitOrder;
  /** Default `byAgent`. */
  readonly schedule?: Schedule;
  /** How many members act per step. Default: all of them. */
  readonly activations?: number;
  /** Default `tour`. Only relevant when `activations` is set. */
  readonly sampling?: Sampling;
}

/**
 * A population of agents of one kind, together with the rules they follow.
 *
 * Subclasses add structure to the population (a lattice, a continuous space).
 * They customise behaviour through {@link populate}, {@link onAdded} and
 * {@link onRemoved}.
 *
 * Membership changes during a step are safe: an agent added mid-step first
 * acts in the next step, and a removed agent is skipped for the rest of it.
 */
export class Scape<A extends Agent = Agent> implements Iterable<A> {
  readonly name: string;
  /** Rules run every step, in this order. */
  readonly rules: RuleEntry<A>[] = [];
  /** Rules run once on each agent when it joins, after `initialize()`. */
  readonly initialRules: Rule<A>[] = [];

  order: VisitOrder;
  schedule: Schedule;
  activations: number | undefined;
  sampling: Sampling;

  protected readonly create: ((index: number) => A) | undefined;
  protected readonly initialSize: number;

  #members: A[] = [];
  #dead = 0;
  #sim: Simulation | undefined;
  #random: Random | undefined;
  #initialized = false;

  constructor(options: ScapeOptions<A>) {
    this.name = options.name;
    this.create = options.create;
    this.initialSize = options.size ?? 0;
    this.order = options.order ?? 'shuffled';
    this.schedule = options.schedule ?? 'byAgent';
    this.activations = options.activations;
    this.sampling = options.sampling ?? 'tour';
    if (!Number.isInteger(this.initialSize) || this.initialSize < 0) {
      throw new RangeError(`Scape "${this.name}": size must be a non-negative integer`);
    }
    if (this.initialSize > 0 && !this.create) {
      throw new Error(`Scape "${this.name}": a size needs a create function`);
    }
  }

  get sim(): Simulation {
    if (!this.#sim) throw new Error(`Scape "${this.name}" has not been added to a simulation`);
    return this.#sim;
  }

  /** This scape's own random stream, independent of other scapes'. */
  get random(): Random {
    if (!this.#random) throw new Error(`Scape "${this.name}" has not been added to a simulation`);
    return this.#random;
  }

  /** The number of live members. */
  get size(): number {
    return this.#members.length - this.#dead;
  }

  /** The live members, in order of joining. Do not hold on to this array across removals. */
  get members(): readonly A[] {
    if (this.#dead > 0) {
      // A new array, so that a loop over the previous one is not disturbed.
      this.#members = this.#members.filter((agent) => agent.alive);
      this.#dead = 0;
    }
    return this.#members;
  }

  [Symbol.iterator](): IterableIterator<A> {
    return this.members[Symbol.iterator]();
  }

  /** Adds a rule to run every step, after those already added. */
  addRule(rule: Rule<A>): this;
  addRule(name: string, execute: (agent: A) => void): this;
  addRule(ruleOrName: Rule<A> | string, execute?: (agent: A) => void): this {
    this.rules.push({ rule: toRule(ruleOrName, execute), enabled: true });
    return this;
  }

  /** Adds a rule to run once on each agent when it joins. */
  addInitialRule(rule: Rule<A>): this;
  addInitialRule(name: string, execute: (agent: A) => void): this;
  addInitialRule(ruleOrName: Rule<A> | string, execute?: (agent: A) => void): this {
    this.initialRules.push(toRule(ruleOrName, execute));
    return this;
  }

  /**
   * Adds an existing agent. Once the simulation is initialized, the agent is
   * initialized and given the initial rules straight away.
   */
  add(agent: A): A {
    if (agent.alive) throw new Error('Agent is already a member of a scape');
    joinScape(agent, this as Scape<Agent>, this.sim.nextAgentId());
    this.#members.push(agent);
    this.onAdded(agent);
    if (this.#initialized) {
      agent.initialize();
      for (const rule of this.initialRules) {
        if (!agent.alive) break;
        runRule(rule, agent);
      }
    }
    return agent;
  }

  /** Creates a new member with the scape's `create` function and adds it. */
  spawn(): A {
    if (!this.create) throw new Error(`Scape "${this.name}" has no create function`);
    return this.add(this.create(this.#members.length));
  }

  /** Removes a member. Returns false if it was not a live member of this scape. */
  remove(agent: A): boolean {
    if (!agent.alive || agent.scape !== (this as Scape<Agent>)) return false;
    leaveScape(agent);
    this.#dead++;
    this.onRemoved(agent);
    agent.removed();
    return true;
  }

  /** A uniformly chosen live member, optionally among those matching a condition. */
  randomMember(condition?: (agent: A) => boolean): A | undefined {
    const candidates = condition ? this.members.filter(condition) : this.members;
    return candidates.length === 0 ? undefined : this.random.pick(candidates);
  }

  /** The live members matching a condition. */
  filter(condition: (agent: A) => boolean): A[] {
    return this.members.filter(condition);
  }

  /** The number of live members matching a condition. */
  count(condition: (agent: A) => boolean): number {
    let total = 0;
    for (const agent of this.members) if (condition(agent)) total++;
    return total;
  }

  /** Called by the simulation when the scape is added to it. */
  attach(sim: Simulation, random: Random): void {
    if (this.#sim) throw new Error(`Scape "${this.name}" already belongs to a simulation`);
    this.#sim = sim;
    this.#random = random;
  }

  /** Called by the simulation to create the initial population. Subclasses may override. */
  populate(): void {
    for (let i = 0; i < this.initialSize; i++) this.spawn();
  }

  /** Called by the simulation once every scape is populated. */
  initializeMembers(): void {
    for (const agent of [...this.members]) if (agent.alive) agent.initialize();
    this.#initialized = true;
  }

  /** Called by the simulation after every scape's members are initialized. */
  runInitialRules(): void {
    if (this.initialRules.length === 0) return;
    const agents = this.#visitOrder(true);
    for (const rule of this.initialRules) {
      for (const agent of agents) if (agent.alive) runRule(rule, agent);
    }
  }

  /** Executes one step of this scape's rules. Called by the simulation. */
  step(): void {
    const rules = this.rules.filter((entry) => entry.enabled).map((entry) => entry.rule);
    if (rules.length === 0) return;
    const agents = this.#visitOrder(false);

    if (this.schedule === 'byAgent') {
      for (const agent of agents) {
        for (const rule of rules) {
          if (!agent.alive) break;
          rule.execute(agent);
        }
      }
    } else {
      for (const rule of rules) {
        for (const agent of agents) if (agent.alive) rule.execute(agent);
      }
    }

    for (const rule of rules) {
      if (!rule.update) continue;
      for (const agent of agents) if (agent.alive) rule.update(agent);
    }
  }

  /** Hook for subclasses: an agent has joined. Runs before the agent is initialized. */
  protected onAdded(_agent: A): void {}

  /** Hook for subclasses: an agent has been removed. Runs before `agent.removed()`. */
  protected onRemoved(_agent: A): void {}

  /** A snapshot of the members that act this step, in the order they act. */
  #visitOrder(everyone: boolean): A[] {
    const all = [...this.members];
    const wanted = everyone ? undefined : this.activations;

    if (wanted !== undefined && this.sampling === 'draw') {
      if (all.length === 0) return all;
      return Array.from({ length: wanted }, () => this.random.pick(all));
    }
    if (this.order === 'shuffled' || (wanted !== undefined && wanted < all.length)) {
      this.random.shuffle(all);
    }
    return wanted !== undefined && wanted < all.length ? all.slice(0, wanted) : all;
  }
}

function toRule<A extends Agent>(
  ruleOrName: Rule<A> | string,
  execute?: (agent: A) => void,
): Rule<A> {
  if (typeof ruleOrName !== 'string') return ruleOrName;
  if (!execute) throw new Error(`Rule "${ruleOrName}" needs an execute function`);
  return { name: ruleOrName, execute };
}

function runRule<A extends Agent>(rule: Rule<A>, agent: A): void {
  rule.execute(agent);
  if (agent.alive) rule.update?.(agent);
}
