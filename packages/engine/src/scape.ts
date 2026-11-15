// SPDX-License-Identifier: EPL-2.0
import { enrol, isMember, joinScape, leaveScape, otherScapes, withdraw, type Agent } from './agent';
import { CellOccupant } from './cell-occupant';
import type { StatCollector } from './data/stat-collector';
import type { Random } from './random';
import type { RootScape } from './root';
import {
  toRule,
  type ExecutionOrder,
  type ExecutionStyle,
  type Rule,
  type RuleEntry,
  type RuleOptions,
} from './rule';
import { ListSpace } from './space/list';
import type { Extent, Space } from './space/space';
import type { ViewSpec } from './view/spec';

export interface ScapeOptions<A extends Agent> {
  /** Unique among the scapes a model is built from. */
  readonly name: string;
  /**
   * The topology of the scape. Default: a {@link ListSpace}. Give another
   * space to change the whole geometry; nothing else need change.
   */
  readonly space?: Space<A>;
  /**
   * The prototype agent, as a function that makes one member like it. It is
   * given the member's index. Required if the scape creates members, at the
   * start or with `newAgent()`; a lattice without one is made of host cells.
   */
  readonly prototypeAgent?: (index: number) => A;
  /** Initial number of members, for spaces that do not fix it. Default 0. */
  readonly size?: number;
  /** The dimensions of the space: `[width, height]` for a lattice or a continuous space. */
  readonly extent?: Extent;
  /** Whether the edges of the space join up. Default true. */
  readonly periodic?: boolean;
  /** Default `byAgent`. */
  readonly executionOrder?: ExecutionOrder;
  /** Default `completeTour`. */
  readonly executionStyle?: ExecutionStyle;
  /** How many members act per iteration. Default: all of them. */
  readonly agentsPerIteration?: number;
  /**
   * Whether the scape draws from a random stream of its own (the default,
   * forked from its parent's when the scape is added) or from its parent's.
   * A scape with a {@link Singleton} space always uses its parent's.
   */
  readonly randomStream?: 'own' | 'parent';
}

/**
 * Hears what happens to a scape. For the run time and for views: a model
 * behaves through rules, never through listeners.
 */
export interface ScapeListener {
  /** The initial population exists, initial rules have run and statistics are collected. */
  scapeInitialized?(scape: Scape): void;
  /** An iteration has completed and its statistics are collected. */
  scapeIterated?(scape: Scape): void;
  /** The model has stopped and will not iterate again. */
  scapeStopped?(scape: Scape): void;
}

/**
 * A collection of agents, the space they are arranged in and the rules they
 * follow; and itself an agent.
 *
 * Because a scape is an agent, it can be a member of another scape and can
 * stand on a host cell. A model is a hierarchy of scapes under one root (see
 * {@link RootScape}), and everything a model has belongs to a scape of it:
 * rules, statistics and views.
 *
 * An agent has one parent scape and may be a member of others (see
 * {@link add}). Membership changes during an iteration are safe: an agent
 * added mid-iteration first acts in the next one, and a removed agent is
 * skipped for the rest of it.
 */
export class Scape<A extends Agent = Agent> extends CellOccupant implements Iterable<A> {
  readonly name: string;
  /** The topology of the scape: where its members are in relation to each other. */
  readonly space: Space<A>;
  /** Rules executed every iteration, in this order. */
  readonly rules: RuleEntry<A>[] = [];
  /** Rules executed once on each agent when it joins, after `initialize()`. */
  readonly initialRules: Rule<A>[] = [];
  /** What the scape collects about its members each period. */
  readonly statCollectors: StatCollector<A>[] = [];
  /** How the scape is shown. */
  readonly views: ViewSpec[] = [];

  executionOrder: ExecutionOrder;
  executionStyle: ExecutionStyle;
  agentsPerIteration: number | undefined;

  readonly prototypeAgent: ((index: number) => A) | undefined;

  #members: A[] = [];
  #dead = 0;
  readonly #memberScapes: Scape[] = [];
  readonly #listeners: ScapeListener[] = [];
  readonly #single: boolean;
  readonly #sharesRandom: boolean;
  #root: RootScape | undefined;
  #random: Random | undefined;
  #populating = false;
  #populated = false;
  #initialized = false;

  constructor(options: ScapeOptions<A>) {
    super();
    this.name = options.name;
    this.prototypeAgent = options.prototypeAgent;
    this.executionOrder = options.executionOrder ?? 'byAgent';
    this.executionStyle = options.executionStyle ?? 'completeTour';
    this.agentsPerIteration = options.agentsPerIteration;
    this.space = options.space ?? new ListSpace<A>();
    this.space.attach(this, {
      extent: options.extent,
      periodic: options.periodic,
      size: options.size,
    });
    this.#single = this.space.geometry === 'singleton';
    this.#sharesRandom = this.#single || options.randomStream === 'parent';
    if (this.#single) this.#members = [this as unknown as A];
  }

  /** The root scape of the model this scape is part of. */
  override get root(): RootScape {
    if (!this.#root) throw new Error(`Scape "${this.name}" has not been added to a model`);
    return this.#root;
  }

  /** Whether this scape is the root of its model. */
  get isRoot(): boolean {
    return (this.#root as Scape | undefined) === this;
  }

  /**
   * The random stream of this scape and its members, independent of other
   * scapes' unless the scape was made to share its parent's.
   */
  override get random(): Random {
    if (this.#random) return this.#random;
    if (this.#sharesRandom && this.#root) return this.scape.random;
    throw new Error(`Scape "${this.name}" has not been added to a model`);
  }

  /** The current period of the model. */
  get period(): number {
    return this.root.period;
  }

  /** The number of iterations the model has executed. */
  get iteration(): number {
    return this.root.iteration;
  }

  /** The dimensions of the scape's space. */
  get extent(): readonly number[] {
    return this.space.extent;
  }

  /** Whether the edges of the scape's space join up. */
  get periodic(): boolean {
    return this.space.periodic;
  }

  /** The number of live members. */
  get size(): number {
    return this.#members.length - this.#dead;
  }

  /** The live members, in order of joining. Do not hold on to this array across removals. */
  get members(): readonly A[] {
    if (this.#dead > 0) {
      // A new array, so that a loop over the previous one is not disturbed.
      // An agent removed here may have joined another scape since, so check where it lives.
      const self = this as unknown as Scape<Agent>;
      this.#members = this.#members.filter((agent) => isMember(agent, self));
      this.#dead = 0;
    }
    return this.#members;
  }

  /** The scapes among this scape's members that have it as their parent. */
  get memberScapes(): readonly Scape[] {
    return this.#memberScapes;
  }

  /** Whether the scape's initial population has been initialized. */
  get initialized(): boolean {
    return this.#initialized;
  }

  [Symbol.iterator](): IterableIterator<A> {
    return this.members[Symbol.iterator]();
  }

  /** Adds a rule to execute every iteration, after those already added. */
  addRule(rule: Rule<A>): this;
  addRule(name: string, execute: (agent: A) => void, options?: RuleOptions): this;
  addRule(ruleOrName: Rule<A> | string, execute?: (agent: A) => void, options?: RuleOptions): this {
    const rule = toRule(ruleOrName, execute, options);
    const occurrence = this.rules.filter((entry) => entry.rule.name === rule.name).length;
    this.rules.push({ rule, occurrence, enabled: true });
    return this;
  }

  /** Adds a rule to execute once on each agent when it joins. */
  addInitialRule(rule: Rule<A>): this;
  addInitialRule(name: string, execute: (agent: A) => void, options?: RuleOptions): this;
  addInitialRule(
    ruleOrName: Rule<A> | string,
    execute?: (agent: A) => void,
    options?: RuleOptions,
  ): this {
    this.initialRules.push(toRule(ruleOrName, execute, options));
    return this;
  }

  /**
   * Adds something to collect about the scape's members each period. Make
   * collectors with the functions of `stat`. Its series appear in the
   * model's data (`root.data`).
   */
  addStatCollector(collector: StatCollector<A>): this {
    this.statCollectors.push(collector);
    this.#root?.registerStatCollector(this, collector as StatCollector);
    return this;
  }

  /**
   * Adds a view of this scape: a lattice, a chart and so on, typically made
   * with the helpers `gridView`, `timeSeriesView` and friends.
   */
  addView(view: ViewSpec): this {
    this.#root?.registerView(view);
    this.views.push(view);
    return this;
  }

  /** Registers a listener; returns a function that removes it again. */
  addScapeListener(listener: ScapeListener): () => void {
    this.#listeners.push(listener);
    return () => {
      const index = this.#listeners.indexOf(listener);
      if (index >= 0) this.#listeners.splice(index, 1);
    };
  }

  /** Tells this scape's listeners of an event. Called by the model. */
  notifyListeners(event: keyof ScapeListener): void {
    for (const listener of [...this.#listeners]) listener[event]?.(this);
  }

  /**
   * Adds an agent, which may be another scape.
   *
   * By default this scape becomes the agent's parent: its behavioural
   * context, the scape `agent.scape` names and whose random stream the agent
   * uses. Once the scape is initialized, the agent is initialized and given
   * the initial rules straight away.
   *
   * With `isParent` false, an agent that already lives in another scape also
   * becomes a member of this one: it takes part in this scape's rules,
   * statistics and space, and keeps its parent. It leaves when it dies or is
   * removed from this scape.
   */
  add<T extends A>(agent: T, isParent = true): T {
    if (this.space.fixedMembership && !this.#populating) {
      throw new Error(`Scape "${this.name}" has fixed membership: members cannot be added`);
    }
    const self = this as unknown as Scape<Agent>;
    if (!isParent) {
      if (!agent.alive) throw new Error('Only a live agent can be added to a further scape');
      if (!isMember(agent, self)) {
        enrol(agent, self);
        this.#members.push(agent);
        this.space.added(agent);
      }
      return agent;
    }
    if (agent.alive) throw new Error('Agent is already a member of a scape');
    if (agent instanceof Scape) {
      this.#adopt(agent as Scape);
    } else {
      joinScape(agent, self, this.root.nextAgentId());
    }
    this.#members.push(agent);
    this.space.added(agent);
    if (this.#initialized) {
      if (agent instanceof Scape) raise(agent as Scape);
      agent.initialize();
      for (const rule of this.initialRules) {
        if (!agent.alive) break;
        runRule(rule, agent);
      }
    }
    return agent;
  }

  /** Creates a new member like the prototype agent and adds it. */
  newAgent(): A {
    if (this.space.fixedMembership && !this.#populating) {
      throw new Error(`Scape "${this.name}" has fixed membership: members cannot be created`);
    }
    if (!this.prototypeAgent) throw new Error(`Scape "${this.name}" has no prototype agent`);
    return this.add(this.prototypeAgent(this.#members.length));
  }

  /**
   * Removes a member. If this scape is the agent's parent the agent leaves
   * the model, and with it every other scape it is a member of. Returns
   * false if the agent was not a live member of this scape.
   */
  remove(agent: A): boolean {
    if (this.space.fixedMembership) {
      throw new Error(`Scape "${this.name}" has fixed membership: members cannot be removed`);
    }
    const self = this as unknown as Scape<Agent>;
    if (!isMember(agent, self)) return false;
    if (agent.scape !== self) {
      withdraw(agent, self);
      this.#dead++;
      this.space.removed(agent);
      return true;
    }
    for (const other of otherScapes(agent)) {
      other.#dead++;
      other.space.removed(agent);
    }
    leaveScape(agent);
    this.#dead++;
    if (agent instanceof Scape) {
      const index = this.#memberScapes.indexOf(agent as Scape);
      if (index >= 0) this.#memberScapes.splice(index, 1);
    }
    this.space.removed(agent);
    agent.removed();
    return true;
  }

  /** A uniformly chosen live member, optionally among those matching a condition. */
  findRandom(condition?: (agent: A) => boolean): A | undefined {
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

  /**
   * Finds a scape by name among those the model was built from, at or below
   * this one, typed by the agent class its caller expects.
   */
  findScape<M extends Agent = Agent>(name: string): Scape<M> {
    const self = this as unknown as Scape;
    const found = this.root.scapes.find((scape) => scape.name === name && scape.#isWithin(self));
    if (!found) throw new Error(`No scape named "${name}"`);
    return found as unknown as Scape<M>;
  }

  /** Creates the initial members. Called once by the model. */
  populate(): void {
    if (this.#populated) return;
    this.#populated = true;
    this.#populating = true;
    try {
      this.space.populate();
    } finally {
      this.#populating = false;
    }
  }

  /** Initializes the members that have this scape as their parent. Called by the model once every scape is populated. */
  initializeMembers(): void {
    const self = this as unknown as Scape<Agent>;
    for (const agent of [...this.members]) {
      if (agent.alive && agent.scape === self) agent.initialize();
    }
    this.#initialized = true;
  }

  /** Executes the initial rules across the members. Called by the model after every scape's members are initialized. */
  executeInitialRules(): void {
    if (this.initialRules.length === 0) return;
    const self = this as unknown as Scape<Agent>;
    const agents = this.#tour(this.initialRules, true);
    for (const rule of this.initialRules) {
      for (const agent of agents) if (this.#single || isMember(agent, self)) runRule(rule, agent);
    }
  }

  /** Executes the selected rules across the members: one iteration of this scape. Called by the model. */
  executeOnMembers(): void {
    const rules = this.rules.filter((entry) => entry.enabled).map((entry) => entry.rule);
    if (rules.length === 0) return;
    const agents = this.#tour(rules, false);
    const self = this as unknown as Scape<Agent>;
    // Only rules that may remove agents make it necessary to check membership as the tour goes.
    const check = !this.#single && rules.some((rule) => rule.causesRemoval !== false);

    if (this.executionOrder === 'byAgent') {
      for (const agent of agents) {
        for (const rule of rules) {
          if (check && !isMember(agent, self)) break;
          rule.execute(agent);
        }
      }
    } else {
      for (const rule of rules) {
        for (const agent of agents) if (!check || isMember(agent, self)) rule.execute(agent);
      }
    }

    for (const rule of rules) {
      if (!rule.update) continue;
      for (const agent of agents) if (!check || isMember(agent, self)) rule.update(agent);
    }
  }

  /** Engine-internal: makes this scape the root of a model. */
  protected enroot(root: RootScape, random: Random): void {
    this.#root = root;
    this.#random = random;
  }

  /** Whether `ancestor` is this scape or contains it. */
  #isWithin(ancestor: Scape): boolean {
    if ((this as unknown as Scape) === ancestor) return true;
    return !this.isRoot && (this.scape as Scape).#isWithin(ancestor);
  }

  /** Takes a scape as a member with this scape as its parent. */
  #adopt(child: Scape): void {
    const root = this.#root;
    root?.admit(child, this);
    joinScape(child, this as unknown as Scape<Agent>, root ? root.nextScapeId() : -1);
    this.#memberScapes.push(child);
    if (root) child.#attach(root);
  }

  /** Makes this scape, and the scapes already in it, part of a model. */
  #attach(root: RootScape): void {
    this.#root = root;
    if (!this.#sharesRandom) this.#random = this.scape.random.fork();
    root.registerScape(this);
    for (const collector of this.statCollectors) {
      root.registerStatCollector(this, collector as StatCollector);
    }
    for (const view of this.views) root.registerView(view);
    for (const child of this.#memberScapes) {
      root.admit(child, this);
      joinScape(child, this as unknown as Scape<Agent>, root.nextScapeId());
      child.#attach(root);
    }
  }

  /** A snapshot of the members that act, in the order they act. */
  #tour(rules: readonly Rule<A>[], everyone: boolean): A[] {
    const all = [...this.members];
    const wanted = everyone ? undefined : this.agentsPerIteration;

    // Repeated draws default to as many draws as there are members.
    if (!everyone && this.executionStyle === 'repeatedDraw') {
      if (all.length === 0) return all;
      return Array.from({ length: wanted ?? all.length }, () => this.random.pick(all));
    }
    const partial = wanted !== undefined && wanted < all.length;
    if (partial || rules.some((rule) => rule.randomExecution !== false)) this.random.shuffle(all);
    return partial ? all.slice(0, wanted) : all;
  }
}

function runRule<A extends Agent>(rule: Rule<A>, agent: A): void {
  rule.execute(agent);
  if (agent.alive) rule.update?.(agent);
}

/**
 * A rule that, executed on a scape, acts on it and passes itself on to the
 * scapes among its members, so that executing it on the root reaches the
 * whole model in a well-defined order. Everything a model does as a whole is
 * such a rule: creating and initializing its agents, iterating, collecting
 * statistics and telling listeners.
 */
export function propagate(
  name: string,
  act: (scape: Scape) => void,
  order: 'scapeFirst' | 'membersFirst' = 'scapeFirst',
): Rule<Agent> {
  const rule: Rule<Agent> = {
    name,
    randomExecution: false,
    causesRemoval: false,
    execute(agent) {
      if (!(agent instanceof Scape)) return;
      const scape = agent as Scape;
      if (order === 'scapeFirst') act(scape);
      for (const member of [...scape.memberScapes]) rule.execute(member);
      if (order === 'membersFirst') act(scape);
    },
  };
  return rule;
}

/** Creates the initial members of every scape, each scape before the scapes in it. */
export const POPULATE_RULE = propagate('Populate', (scape) => scape.populate());

/** Calls `initialize()` on every agent, the members of each scape before those of the scapes in it. */
export const INITIALIZE_RULE = propagate('Initialize', (scape) => scape.initializeMembers());

/** Executes every scape's initial rules, those of the scapes in a scape before its own. */
export const INITIAL_RULES_RULE = propagate(
  'Initial Rules',
  (scape) => scape.executeInitialRules(),
  'membersFirst',
);

/** Executes every scape's rules across its members, each scape before the scapes in it. */
export const EXECUTE_RULES_RULE = propagate('Iterate Scape', (scape) => scape.executeOnMembers());

/** Brings a scape added to a running model to the state of the scapes around it. */
function raise(scape: Scape): void {
  POPULATE_RULE.execute(scape);
  INITIALIZE_RULE.execute(scape);
  INITIAL_RULES_RULE.execute(scape);
}
