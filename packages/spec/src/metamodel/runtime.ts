// SPDX-License-Identifier: EPL-2.0
//
// What a model in the Metascape model format (derived from the MetaABM
// metamodel; see ./types.ts) is made of while it runs on the engine: its
// agents, cells and scapes, the instances of its spaces, and the state of one
// run.
import {
  CellOccupant,
  HostCell,
  ListSpace,
  Scape,
  Singleton,
  type Agent,
  type Array2D,
  type Cell,
  type Graph,
  type Metric,
  type Random,
  type RootScape,
} from '@metascape/engine';
import type { Datum, StyleAccumulator } from './functions';
import type {
  AgentInfo,
  AttributeInfo,
  ModelIndex,
  OwnerInfo,
  ScapeInfo,
  SpaceInfo,
} from './model-index';

/**
 * How deep watches and causes may set each other off before the run is
 * stopped (R16). A watch that sets the attribute it watches, or a cause that
 * runs the act it is part of, goes one level deeper each time.
 */
export const MAX_TRIGGER_DEPTH = 100;

/** A derived value, kept until something it was computed from changes (R16). */
interface DerivedValue {
  readonly value: Datum;
  readonly period: number;
  /** The structure version it was computed at, if it looked at where agents are. */
  readonly structure: number | undefined;
  /** What it read, and the values read. */
  readonly reads: readonly (readonly [Holder, AttributeInfo, Datum])[];
}

/** Anything with attribute values: an agent, a cell, a scape or a space. */
export interface Holder {
  readonly info: OwnerInfo;
  readonly values: Datum[];
  /** The scape instance this is in. For a scape instance, the one that contains it. */
  readonly context: InterpScape | undefined;
  /** Values when the agent started, for `original`. */
  originals?: Datum[] | undefined;
  /** Derived values, by attribute position. */
  derived?: Map<number, DerivedValue> | undefined;
}

export function isHolder(value: unknown): value is Holder {
  return (
    value instanceof InterpAgent ||
    value instanceof InterpCell ||
    value instanceof InterpScape ||
    value instanceof SpaceInstance
  );
}

/** An agent of a model: a cell occupant, which is also how agents in lists, networks and continuous spaces are made. */
export class InterpAgent extends CellOccupant implements Holder {
  readonly values: Datum[];
  originals?: Datum[] | undefined;
  derived?: Map<number, DerivedValue> | undefined;

  constructor(
    readonly info: AgentInfo,
    public context: InterpScape,
  ) {
    super();
    this.values = info.attributes.map((attribute) => attribute.initial);
  }
}

/** A cell of a grid whose cells are agents of a model (MetaABM's fill agent). */
export class InterpCell extends HostCell implements Holder {
  readonly values: Datum[];
  originals?: Datum[] | undefined;
  derived?: Map<number, DerivedValue> | undefined;
  /** The new value each diffusion has worked out for the cell, by the diffusion's number, until it is taken. */
  diffusing: (number | undefined)[] | undefined;

  constructor(
    readonly info: AgentInfo,
    readonly context: InterpScape,
  ) {
    super();
    this.values = info.attributes.map((attribute) => attribute.initial);
  }
}

/**
 * A scape of a model: the root scape, or one instance of a scape nested in
 * another. It holds the instances of its spaces and the populations of its
 * agent types. The root's own rules run on it alone (it has a singleton
 * space, as the manager scape Ascape's generator made); a nested scape's own
 * rules belong to the population it is a member of.
 */
export class InterpScape extends Scape<Agent> implements Holder {
  readonly values: Datum[];
  originals?: Datum[] | undefined;
  derived?: Map<number, DerivedValue> | undefined;
  /** The instances of this scape's spaces, by space ID. */
  readonly spaces = new Map<string, SpaceInstance>();
  /** The population of each agent type of this scape that is not the cells of a grid, by agent ID. */
  readonly populations = new Map<string, Scape<Agent>>();

  constructor(
    readonly info: ScapeInfo,
    readonly context: InterpScape | undefined,
    readonly state: RunState,
    name: string,
    singleton: boolean,
  ) {
    super({
      name,
      space: singleton ? new Singleton() : new ListSpace(),
      initialRulesAtStartOnly: true,
      executionOrder: info.execution.order === 'agent' ? 'byAgent' : 'byRule',
    });
    this.values = info.attributes.map((attribute) => attribute.initial);
  }
}

/** One instance of a space: the space of one scape instance. */
export abstract class SpaceInstance implements Holder {
  readonly values: Datum[];

  constructor(
    readonly info: SpaceInfo,
    readonly context: InterpScape,
    values: Datum[],
  ) {
    this.values = values;
  }

  /** The distance between two agents in this space, or undefined if either is not in it. */
  abstract distance(a: Agent, b: Agent): number | undefined;
}

/** How many cells a grid keeps in its lists of cells within a radius. */
const MAX_CACHED_CELLS = 1_000_000;

/** A grid: a scape of cells. */
export class GridInstance extends SpaceInstance {
  readonly metric: Metric;

  constructor(
    info: SpaceInfo,
    context: InterpScape,
    values: Datum[],
    readonly scape: Scape<Cell>,
  ) {
    super(info, context, values);
    const neighborhood = info.decl.kind === 'grid' ? info.decl.neighborhood : 'moore';
    // Ascape's Array2DEuclidian has Moore neighbours and measures straight-line distance.
    this.metric =
      neighborhood === 'euclidean'
        ? 'euclidean'
        : neighborhood === 'vonNeumann'
          ? 'manhattan'
          : 'chebyshev';
  }

  get grid(): Array2D<Cell> {
    return this.scape.space as Array2D<Cell>;
  }

  /** The cells within each radius of each cell, origin included, by radius then cell. */
  readonly #within = new Map<number, (readonly Cell[] | undefined)[]>();
  #cached = 0;

  /**
   * The cells within a distance of a cell by this grid's metric, the cell
   * itself included, as `findWithin` orders them. Kept once worked out, up to
   * a bound on how many are kept.
   */
  within(cell: Cell, radius: number): readonly Cell[] {
    let byCell = this.#within.get(radius);
    const index = cell.y * this.grid.width + cell.x;
    const known = byCell?.[index];
    if (known && this.scape.members[index] === cell) return known;
    const found = this.grid.findWithin(cell, radius, { metric: this.metric, includeSelf: true });
    if (this.#cached + found.length <= MAX_CACHED_CELLS) {
      if (!byCell) this.#within.set(radius, (byCell = []));
      byCell[index] = Object.freeze(found);
      this.#cached += found.length;
    }
    return found;
  }

  get multiOccupant(): boolean {
    return this.grid.multiOccupancy;
  }

  /** The cell an agent is at: itself if it is a cell of this grid, else the cell it stands on. */
  location(agent: Agent): Cell | undefined {
    if (agent instanceof CellOccupant) {
      const cell = agent.hostCell;
      return cell && cell.scape === this.scape ? cell : undefined;
    }
    if (agent instanceof HostCell) return agent.scape === this.scape ? agent : undefined;
    return undefined;
  }

  distance(a: Agent, b: Agent): number | undefined {
    const from = this.location(a);
    const to = this.location(b);
    return from && to ? this.grid.distance(from, to, this.metric) : undefined;
  }
}

/** A continuous space, shared by the populations of the agent types in it. */
export class ContinuousInstance extends SpaceInstance {
  /** The populations in this space, each with a continuous space of its own of the same size. */
  readonly scapes: Scape<Agent>[] = [];

  constructor(
    info: SpaceInfo,
    context: InterpScape,
    values: Datum[],
    readonly width: number,
    readonly height: number,
    readonly periodic: boolean,
  ) {
    super(info, context, values);
  }

  contains(agent: Agent): boolean {
    return agent instanceof CellOccupant && this.scapes.includes(agent.scape as Scape<Agent>);
  }

  distance(a: Agent, b: Agent): number | undefined {
    if (!this.contains(a) || !this.contains(b)) return undefined;
    const from = a as CellOccupant;
    const to = b as CellOccupant;
    let dx = Math.abs(from.x - to.x);
    let dy = Math.abs(from.y - to.y);
    if (this.periodic) {
      dx = Math.min(dx, this.width - dx);
      dy = Math.min(dy, this.height - dy);
    }
    return Math.hypot(dx, dy);
  }
}

/** A network: a scape whose members are the agents it links. */
export class NetworkInstance extends SpaceInstance {
  constructor(
    info: SpaceInfo,
    context: InterpScape,
    values: Datum[],
    readonly scape: Scape<Agent>,
  ) {
    super(info, context, values);
  }

  get graph(): Graph<Agent> {
    return this.scape.space as Graph<Agent>;
  }

  /** Makes an agent a node of the network, if it is not one already. */
  enrol(agent: Agent): void {
    if (agent.alive) this.scape.add(agent, false);
  }

  distance(a: Agent, b: Agent): number | undefined {
    if (a === b) return 0;
    const hops = this.graph.distance(a, b);
    return Number.isFinite(hops) ? hops : undefined;
  }
}

/** The scape instance an agent, cell or scape is in; for a scape instance, the scape itself. */
export function scapeOf(bound: Agent, state: RunState): InterpScape | undefined {
  if (bound instanceof InterpScape) return bound;
  if (bound instanceof InterpAgent || bound instanceof InterpCell) return bound.context;
  if (bound instanceof HostCell) return state.grids.get(bound.scape as Scape<Cell>)?.context;
  return undefined;
}

/** The innermost scape instance of a type around an agent, if there is one. */
export function enclosing(bound: Agent, type: ScapeInfo, state: RunState): InterpScape | undefined {
  for (let scape = scapeOf(bound, state); scape; scape = scape.context) {
    if (scape.info === type) return scape;
  }
  return undefined;
}

/**
 * The scape instances of a type that an agent can see: the one around it, or
 * if there is none, every instance of the type within the agent's own scape.
 */
export function instancesOf(bound: Agent, type: ScapeInfo, state: RunState): InterpScape[] {
  const around = enclosing(bound, type, state);
  if (around) return [around];
  const found: InterpScape[] = [];
  const visit = (scape: InterpScape) => {
    if (scape.info === type) {
      found.push(scape);
      return;
    }
    for (const agent of scape.info.agents) {
      if (agent.kind !== 'scape') continue;
      for (const member of scape.populations.get(agent.id)?.members ?? []) {
        if (member instanceof InterpScape) visit(member);
      }
    }
  };
  const start = scapeOf(bound, state);
  if (start) visit(start);
  return found;
}

/** What a derive is computing: the values it has read so far. */
interface Tracker {
  reads: (readonly [Holder, AttributeInfo, Datum])[];
  structure: boolean;
}

/** What a run of a behaviour's root act needs from the interpreter's compiled acts. */
export interface Behaviours {
  /** The watch acts of an attribute's owner that watch it, by attribute position. */
  watchers(info: AgentInfo, attribute: AttributeInfo): readonly ((holder: Holder) => void)[];
  /** Computes a derived attribute, or returns undefined if no derive act reaches a value. */
  derive(
    info: AgentInfo,
    attribute: AttributeInfo,
  ): ((holder: Holder) => Datum | undefined) | undefined;
}

/** The state of one run of a model, shared by everything in it. */
export class RunState {
  /** True while the model is being built, before it starts. */
  building = true;
  /** Changes whenever agents move, are born, die or are linked: whatever a selection could see. */
  structure = 0;
  /** Changes whenever anything changes, for redrawing. */
  version = 0;
  /** The grid instance of each grid's scape of cells. */
  readonly grids = new Map<Scape<Cell>, GridInstance>();
  /** Present while a style is being worked out. */
  style: StyleAccumulator | undefined;
  /** Present while a derived value is being worked out: the value of the last evaluate reached. */
  capture: { value: Datum | undefined } | undefined;
  /** The root scape instance. */
  scape!: InterpScape;
  /** Creates an agent of a type in a scape instance; undefined if agents of that type cannot be created. */
  create!: (type: AgentInfo, scape: InterpScape) => Agent | undefined;
  /** Whether agents keep the values they started with, for `original`. */
  keepsOriginals = false;
  #depth = 0;
  #tracker: Tracker | undefined;
  readonly #names = new Set<string>();

  constructor(
    readonly root: RootScape,
    readonly index: ModelIndex,
    readonly behaviours: Behaviours,
  ) {}

  get period(): number {
    return this.root.period;
  }

  /** A name for a scape not yet used in this run. */
  uniqueName(base: string): string {
    let name = base;
    for (let n = 2; this.#names.has(name); n++) name = `${base} ${n}`;
    this.#names.add(name);
    return name;
  }

  /** Notes that where agents are, or which agents there are, has changed. */
  restructured(): void {
    this.structure++;
    this.version++;
  }

  /**
   * Whether a derived value is being worked out, so that reads must go
   * through {@link read} to be recorded. When not, a value that is not
   * derived can be read straight from its holder.
   */
  get tracking(): boolean {
    return this.#tracker !== undefined;
  }

  /** Notes that what is being derived looks at where agents are. */
  looked(): void {
    if (this.#tracker) this.#tracker.structure = true;
  }

  /** Reads an attribute of a holder, working out a derived value if need be. */
  read(holder: Holder, attribute: AttributeInfo): Datum {
    if (attribute.decl.derived && holder.info.kind !== 'space') {
      const derive = this.behaviours.derive(holder.info, attribute);
      if (derive) {
        const value = this.#derived(holder, attribute, derive);
        this.#tracker?.reads.push([holder, attribute, value]);
        return value;
      }
    }
    const value = holder.values[attribute.index]!;
    this.#tracker?.reads.push([holder, attribute, value]);
    return value;
  }

  /** Sets an attribute of a holder and runs the watches of it (R16). */
  write(holder: Holder, attribute: AttributeInfo, value: Datum): void {
    if (attribute.decl.derived) {
      throw new Error(`\`${attribute.ref}\` is derived, so it cannot be set`);
    }
    holder.values[attribute.index] =
      attribute.type === 'integer' && typeof value === 'number' ? Math.trunc(value) : value;
    this.version++;
    if (holder.info.kind === 'space' || !attribute.watched) return;
    for (const watch of this.behaviours.watchers(holder.info, attribute)) {
      this.trigger(`the watch of \`${attribute.ref}\``, () => watch(holder));
    }
  }

  /**
   * Runs something a watch or cause set off, one level deeper. Past
   * {@link MAX_TRIGGER_DEPTH} it does nothing and the run stops at the end of
   * the period, saying why.
   */
  trigger(what: string, run: () => void): void {
    if (this.#depth >= MAX_TRIGGER_DEPTH) {
      this.root.stop(
        `Watches and causes set each other off more than ${MAX_TRIGGER_DEPTH} levels deep, at ${what}. The run is stopped.`,
      );
      return;
    }
    this.#depth++;
    try {
      run();
    } finally {
      this.#depth--;
    }
  }

  #derived(
    holder: Holder,
    attribute: AttributeInfo,
    derive: (holder: Holder) => Datum | undefined,
  ): Datum {
    const cached = holder.derived?.get(attribute.index);
    if (cached && this.#current(cached)) return cached.value;
    const outer = this.#tracker;
    const tracker: Tracker = { reads: [], structure: false };
    this.#tracker = tracker;
    let value: Datum;
    try {
      value = derive(holder) ?? attribute.initial;
    } finally {
      this.#tracker = outer;
    }
    (holder.derived ??= new Map()).set(attribute.index, {
      value,
      period: this.period,
      structure: tracker.structure ? this.structure : undefined,
      reads: tracker.reads,
    });
    return value;
  }

  /** Whether nothing a derived value was computed from has changed since. */
  #current(cached: DerivedValue): boolean {
    if (cached.period !== this.period) return false;
    if (cached.structure !== undefined && cached.structure !== this.structure) return false;
    const outer = this.#tracker;
    this.#tracker = undefined;
    try {
      return cached.reads.every(
        ([holder, attribute, value]) => this.read(holder, attribute) === value,
      );
    } finally {
      this.#tracker = outer;
    }
  }
}

/** The random stream an agent's choices use. */
export function randomOf(agent: Agent): Random {
  return agent.random;
}
