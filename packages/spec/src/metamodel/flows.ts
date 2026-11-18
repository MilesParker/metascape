// SPDX-License-Identifier: EPL-2.0
//
// Compiles the acts of an agent or style in the Metascape model format
// (derived from the MetaABM metamodel; see ./types.ts) into closures, once.
//
// Acts are a dataflow language (docs/metamodel-review.md, "Execution
// semantics"). What flows along an edge is an agent with the context of its
// path: here a Frame, which binds each selection made upstream to the agent it
// chose and keeps the values of evaluates. The closures run a flow depth
// first, in the order of the acts, as MetaABM's generators did:
//
// - A root act starts a flow with a frame binding it to the acting agent.
// - A select and the queries attached to it (its region) describe a set. Each
//   place where a flow leaves the region (an exit) chooses from that set by
//   the cardinality terms upstream of it and binds the select to each agent
//   chosen, in a frame of its own.
// - Queries and logic acts outside a region are predicates on frames. Where
//   one has acts after it that are not queries or logic acts (a gate), the
//   flow goes through it when the predicate holds. A gate is decided once,
//   when the flow reaches the last of the acts that feed it, so that every
//   selection it depends on is bound.
// - Every other act fires once for each frame that reaches it.
import {
  CellOccupant,
  HostCell,
  LocatedAgent,
  type Agent,
  type Cell,
  type Random,
  type Scape,
} from '@metascape/engine';
import {
  combineTypes,
  resultType,
  StyleAccumulator,
  type Argument,
  type Call,
  type CallInfo,
  type Datum,
  type FunctionImplementation,
  type InputInfo,
  type SpatialTerm,
  type ValueType,
} from './functions';
import { createMethod, type MethodImplementation, type MethodRunner } from './method';
import {
  actsOf,
  type AgentInfo,
  type ModelIndex,
  type OwnerInfo,
  type ScapeInfo,
  type SpaceInfo,
} from './model-index';
import {
  ContinuousInstance,
  enclosing,
  GridInstance,
  InterpAgent,
  instancesOf,
  isHolder,
  NetworkInstance,
  type Holder,
  type RunState,
  type SpaceInstance,
} from './runtime';
import {
  ROOT_ACT_KINDS,
  type Act,
  type ActId,
  type Input,
  type LibraryFunction,
  type Constant,
  type SelectAct,
  type Value,
} from './types';

type FlowAct = Exclude<Act, { kind: 'group' }>;

/** A function of the library, with its implementation. */
export interface FunctionEntry {
  readonly fn: LibraryFunction;
  readonly impl: FunctionImplementation;
}

/** A selection bound to an agent, with what its path has computed. */
export class Frame {
  #memo: Map<string, Datum | undefined> | undefined;

  constructor(
    readonly state: RunState,
    readonly parent: Frame | undefined,
    /** The select-like act this frame binds. */
    readonly select: ActId,
    readonly agent: Agent,
    /** For a select: the exit of its region that chose the agent. */
    readonly exit: Exit | undefined,
    /** The random stream of the acting agent. */
    readonly random: Random,
  ) {}

  find(select: ActId): Frame | undefined {
    return this.select === select ? this : this.parent?.find(select);
  }

  /** The agent a selection is bound to. */
  agentOf(select: ActId): Agent {
    const frame = this.find(select);
    if (!frame) throw new Error(`Internal error: \`${select}\` is not bound on this path`);
    return frame.agent;
  }

  /** The bottom frame: the root act's. */
  get root(): Frame {
    return this.parent ? this.parent.root : this;
  }

  /** A value remembered on this frame itself. */
  own(key: string): { value: Datum | undefined } | undefined {
    return this.#memo?.has(key) ? { value: this.#memo.get(key) } : undefined;
  }

  /** The same bindings on a frame of their own: what one arrival at a set of gates decides on. */
  arrival(): Frame {
    return new Frame(this.state, this, this.select, this.agent, this.exit, this.random);
  }

  /** A value remembered on this path. */
  recall(key: string): { value: Datum | undefined } | undefined {
    return this.own(key) ?? this.parent?.recall(key);
  }

  remember(key: string, value: Datum | undefined): void {
    (this.#memo ??= new Map()).set(key, value);
  }
}

export type Role = 'root' | 'select' | 'create' | 'control' | 'statement';

/** What a flow goes on to from an act: an act to fire, or a gate and the acts after it. */
export type Unit =
  | { readonly kind: 'fire'; readonly topo: number; readonly target: Node }
  | {
      readonly kind: 'gate';
      readonly topo: number;
      /** The query or logic act decided, on a frame of its own for each arrival. */
      readonly gate: Node;
      /** The acts after the gate, upstream first. */
      readonly after: readonly Node[];
      readonly predicate: (frame: Frame) => boolean;
    };

export interface Node {
  readonly id: ActId;
  readonly act: FlowAct;
  /** Position in the order the acts are written. */
  readonly order: number;
  readonly role: Role;
  readonly targets: Node[];
  readonly sources: Node[];
  /** Position in the order flows run: upstream first, then the order written. */
  topo: number;
  /** For a select, its region; for a query or logic act in a region, that region. */
  region: Region | undefined;
  /** What the flow goes on to from this act, when it is not a region's exit. */
  units: Unit[];
  /** Fires the act on a frame: statements, selects and creates. */
  fire: (frame: Frame) => void;
}

export interface Region {
  readonly select: Node;
  readonly members: Set<Node>;
  readonly exits: Exit[];
}

export type Cardinality = 'one' | 'all' | 'nearest' | 'minimize' | 'maximize';

/** Where the candidates of a selection come from: around the origin by a spatial term, else the whole population. */
export type Generator = 'here' | 'neighbor' | 'sight' | 'within' | 'population';

/** A place where a flow leaves a select's region, choosing from the set the region describes. */
export interface Exit {
  readonly node: Node;
  readonly region: Region;
  /** The members of the region upstream of the exit, the exit included. */
  readonly upstream: Set<Node>;
  /** The first query upstream of the exit for each spatial term. */
  readonly terms: ReadonlyMap<SpatialTerm, Node>;
  readonly cardinality: Cardinality;
  /** Whether every agent of the set is chosen (`all`), rather than one. */
  readonly every: boolean;
  readonly includeSelf: boolean;
  /** Whether a term places the search around the origin, so that the origin is left out. */
  readonly locating: boolean;
  readonly here: boolean;
  readonly toward: boolean;
  readonly away: boolean;
  /** The agent type chosen from, if the select names one. */
  readonly type: AgentInfo | undefined;
  readonly generator: Generator;
  /** The radius of `within`, or the range of `lineOfSight`, when it does not depend on the candidate. */
  readonly radius: Input | undefined;
  readonly sight: Input | undefined;
  /**
   * The coordinates of `location2D`, when they are plain values that do not
   * depend on the candidate: the cell of a grid there is found directly
   * rather than by testing every cell.
   */
  readonly at: readonly [Input, Input] | undefined;
  /**
   * The spatial filters upstream of the exit (all must hold), in order, and
   * for each whether the generator's search on a grid already ensures it.
   */
  readonly filters: readonly { readonly node: Node; readonly implied: boolean }[];
  /** The input whose value `minimize` or `maximize` takes the extreme of. */
  readonly score: Input | undefined;
  /**
   * Whether the choice is the nearest of a population: on a grid, the cells
   * are then searched outward from the origin by rank (see {@link nearestCells}).
   */
  readonly ranked: boolean;
  units: Unit[];
  choose: (env: Env) => Agent[];
}

/** A predicate on a candidate of a selection. */
type CandidatePredicate = (candidate: Agent, env: Env) => boolean;

/** A value read on a frame, with its type. */
interface Getter {
  readonly type: ValueType;
  readonly info: InputInfo;
  get(frame: Frame): Argument;
}

const ROOT_KINDS: ReadonlySet<string> = new Set(ROOT_ACT_KINDS);
const LOGIC_KINDS: ReadonlySet<string> = new Set(['all', 'any', 'none']);
/** Spatial terms that place the search around the origin, so that the origin itself is left out unless `includeSelf`. */
/** Spatial terms that constrain where to look; every one upstream of an exit holds for what it chooses. */
const FILTER_TERMS: ReadonlySet<SpatialTerm> = new Set([
  'neighbor',
  'within',
  'lineOfSight',
  'here',
  'available',
  'location2D',
]);
const LOCATING_TERMS: ReadonlySet<SpatialTerm> = new Set([
  'neighbor',
  'within',
  'lineOfSight',
  'nearest',
  'minimize',
  'maximize',
  'here',
]);

function roleOf(act: FlowAct): Role {
  if (ROOT_KINDS.has(act.kind)) return 'root';
  if (act.kind === 'select') return 'select';
  if (act.kind === 'create') return 'create';
  if (act.kind === 'query' || LOGIC_KINDS.has(act.kind)) return 'control';
  return 'statement';
}

const num = (value: Argument | undefined): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  throw new TypeError(`Expected a number, found ${JSON.stringify(value)}`);
};

function literalType(value: Datum): ValueType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'symbol';
  return Number.isInteger(value) ? 'integer' : 'real';
}

/**
 * The types of a sink's inputs, a numeric constant (`unit`, `zero`) taking
 * the type of the numbers beside it: real if any is real, else integer if any
 * is an integer.
 */
function withConstants(inputs: readonly Input[], types: readonly ValueType[]): ValueType[] {
  const others = types.filter((_, i) => !('constant' in (inputs[i] ?? {})));
  const fitted: ValueType = others.includes('real')
    ? 'real'
    : others.includes('integer')
      ? 'integer'
      : 'numeric';
  return types.map((type, i) =>
    'constant' in (inputs[i] ?? {}) && type === 'numeric' ? fitted : type,
  );
}

function describe(agent: Agent): string {
  if (isHolder(agent)) return `${agent.info.label} ${agent.id}`;
  return agent instanceof HostCell ? `the cell at (${agent.x}, ${agent.y})` : `agent ${agent.id}`;
}

/** The holder of an attribute, from an agent bound in a flow: the agent itself, or the scape or space around it. */
export function holderFor(bound: Agent, owner: OwnerInfo, state: RunState): Holder {
  if (owner.kind === 'space') {
    const space = enclosing(bound, owner.context, state)?.spaces.get(owner.id);
    if (space) return space;
  } else if (owner.kind === 'scape') {
    // Every agent of the model is inside the one instance of the root scape.
    if (owner === state.index.root && (bound as Partial<Holder>).info !== undefined) {
      return state.scape;
    }
    const scape = enclosing(bound, owner as ScapeInfo, state);
    if (scape) return scape;
  } else if (isHolder(bound) && bound.info === owner) {
    return bound;
  }
  throw new Error(`${describe(bound)} has no \`${owner.id}\` attributes`);
}

/** The instance of a space around an agent. */
export function spaceAround(
  bound: Agent,
  space: SpaceInfo,
  state: RunState,
): SpaceInstance | undefined {
  return enclosing(bound, space.context, state)?.spaces.get(space.id);
}

/** Where an agent is in a space: its cell in a grid, or itself. */
export function locate(space: SpaceInstance | undefined, agent: Agent): Agent | undefined {
  if (space instanceof GridInstance) return space.location(agent);
  return agent;
}

/** The candidates of one selection: the frame it is made in, its origin and its space. */
export class Env {
  readonly #frames = new Map<Agent, Frame>();
  readonly originLocation: Agent | undefined;

  constructor(
    readonly frame: Frame,
    readonly select: ActId,
    readonly exit: Exit | undefined,
    /** The agent the selection searches from: the one bound by the select's own selection. */
    readonly origin: Agent | undefined,
    readonly space: SpaceInstance | undefined,
    readonly includeSelf: boolean,
  ) {
    this.originLocation = origin && locate(space, origin);
  }

  /** A frame binding the selection to a candidate. */
  frameFor(candidate: Agent): Frame {
    let frame = this.#frames.get(candidate);
    if (!frame) {
      frame = new Frame(
        this.frame.state,
        this.frame,
        this.select,
        candidate,
        this.exit,
        this.frame.random,
      );
      this.#frames.set(candidate, frame);
    }
    return frame;
  }

  isNeighbor(candidate: Agent): boolean {
    return isNeighbor(this.space, this.origin, this.originLocation, this.includeSelf, candidate);
  }

  isWithin(candidate: Agent, distance: number): boolean {
    return isWithin(this.space, this.origin, candidate, distance);
  }

  isInLine(candidate: Agent, distance: number): boolean {
    return isInLine(
      this.space,
      this.origin,
      this.originLocation,
      this.includeSelf,
      candidate,
      distance,
    );
  }

  isHere(candidate: Agent): boolean {
    return isHere(this.space, this.origin, this.originLocation, candidate);
  }

  isAvailable(candidate: Agent): boolean {
    return isAvailable(candidate);
  }

  isAt(candidate: Agent, x: number, y: number): boolean {
    return isAt(this.space, candidate, x, y);
  }
}

// The spatial terms as tests of a candidate, from an origin in a space. `from`
// is where the origin is in the space (its cell in a grid).

export function isNeighbor(
  space: SpaceInstance | undefined,
  origin: Agent | undefined,
  from: Agent | undefined,
  includeSelf: boolean,
  candidate: Agent,
): boolean {
  if (!space || !origin) return false;
  if (space instanceof GridInstance) {
    const at = space.location(candidate);
    if (!from || !at) return false;
    if (includeSelf && at === from) return true;
    return space.grid.neighbors(from as Cell).includes(at);
  }
  if (space instanceof NetworkInstance) {
    if (includeSelf && candidate === origin) return true;
    return space.graph.neighbors(origin).includes(candidate);
  }
  return isWithin(space, origin, candidate, 1);
}

export function isWithin(
  space: SpaceInstance | undefined,
  origin: Agent | undefined,
  candidate: Agent,
  distance: number,
): boolean {
  if (!space || !origin) return false;
  const d = space.distance(origin, candidate);
  return d !== undefined && d <= distance;
}

/** Whether a candidate is in sight along a direction of the grid's neighbourhood; elsewhere, within. */
export function isInLine(
  space: SpaceInstance | undefined,
  origin: Agent | undefined,
  from: Agent | undefined,
  includeSelf: boolean,
  candidate: Agent,
  distance: number,
): boolean {
  if (!space || !origin) return false;
  if (!(space instanceof GridInstance)) return isWithin(space, origin, candidate, distance);
  const at = space.location(candidate);
  if (!from || !at) return false;
  return at === from ? includeSelf : space.grid.rays(from as Cell, distance).includes(at);
}

export function isHere(
  space: SpaceInstance | undefined,
  origin: Agent | undefined,
  from: Agent | undefined,
  candidate: Agent,
): boolean {
  if (!space || !origin) return false;
  if (space instanceof GridInstance) {
    const at = space.location(candidate);
    return at !== undefined && at === from;
  }
  if (space instanceof NetworkInstance) return candidate === origin;
  return space.distance(origin, candidate) === 0;
}

export function isAvailable(candidate: Agent): boolean {
  if (!(candidate instanceof HostCell)) return true;
  return candidate.isAvailable || candidate.scape.space.multiOccupancy;
}

export function isAt(
  space: SpaceInstance | undefined,
  candidate: Agent,
  x: number,
  y: number,
): boolean {
  const at = locate(space, candidate);
  return at instanceof LocatedAgent && at.x === x && at.y === y;
}

/** The members of an agent type's populations that an agent can see. */
export function populationOf(type: AgentInfo, near: Agent, state: RunState): readonly Agent[] {
  if (!type.context) return [state.scape];
  const instances = instancesOf(near, type.context, state);
  if (instances.length === 1 && type.fills.length === 0) {
    // One population: its members as they are (the caller only reads them).
    return instances[0]!.populations.get(type.id)?.members ?? [];
  }
  const found: Agent[] = [];
  for (const scape of instances) {
    if (type.fills.length > 0) {
      for (const space of type.fills) {
        const grid = scape.spaces.get(space.id);
        if (grid instanceof GridInstance) found.push(...grid.scape.members);
      }
    } else {
      found.push(...(scape.populations.get(type.id)?.members ?? []));
    }
  }
  return found;
}

/**
 * Whether a selection's nearest choice searches a grid outward from the
 * origin, rank by rank, rather than testing every cell: when it chooses the
 * nearest of a grid's cells and the origin is on the grid.
 */
export function searchesRanks(
  exit: Exit,
  space: SpaceInstance | undefined,
  from: Agent | undefined,
): space is GridInstance {
  return (
    exit.ranked &&
    from !== undefined &&
    space instanceof GridInstance &&
    (!exit.type || space.info.fill === exit.type) &&
    space.ranks !== undefined
  );
}

/**
 * The cells of the nearest rank around `from` that pass `test`, in the
 * population's order; none if no cell passes. Every cell nearer than these
 * fails the test and every cell farther is not tested, so for tests that
 * draw nothing and change nothing, these are exactly the cells a scan of the
 * whole population would find nearest, in the order it would find them.
 */
export function nearestCells(
  space: GridInstance,
  from: Agent,
  test: (cell: Agent) => boolean,
): Agent[] {
  const ranks = space.ranks!;
  const grid = space.grid;
  const origin = from as Cell;
  const width = grid.width;
  for (let r = 0; r < ranks.ranks.length; r++) {
    const matches = ranks.matchesInRank(grid, origin, test, r);
    if (matches.length === 0) continue;
    if (matches.length > 1) matches.sort((a, b) => a.y * width + a.x - (b.y * width + b.x));
    return matches;
  }
  return [];
}

/** Whether a selection's candidates come from a search around the origin on a grid. */
export function searchesGrid(
  exit: Exit,
  space: SpaceInstance | undefined,
  origin: Agent | undefined,
  from: Agent | undefined,
): boolean {
  return (
    exit.generator !== 'population' &&
    origin !== undefined &&
    from !== undefined &&
    space instanceof GridInstance
  );
}

/**
 * The candidates of a selection, before its tests: around the origin by the
 * exit's generator, else the whole population of the agent type. The radius
 * and range are worked out only where the search needs them.
 */
export function exitCandidates(
  exit: Exit,
  space: SpaceInstance | undefined,
  origin: Agent | undefined,
  from: Agent | undefined,
  root: Agent,
  state: RunState,
  radius: (() => number) | undefined,
  sight: (() => number) | undefined,
  at?: () => readonly [number, number],
): readonly Agent[] {
  const { type, generator, includeSelf } = exit;
  const cellsWanted = space instanceof GridInstance && (!type || space.info.fill === type);
  const ofType = (agents: readonly Agent[]) =>
    type ? agents.filter((agent) => (agent as Partial<Holder>).info === type) : agents;
  /** The occupants of cells, of the type if one is named. */
  const occupants = (cells: readonly Cell[]) => {
    const found: Agent[] = [];
    for (const at of cells) {
      if (!(at instanceof HostCell)) continue;
      for (const occupant of at.occupants) {
        if (!type || (occupant as Partial<Holder>).info === type) found.push(occupant);
      }
    }
    return found;
  };
  if (generator === 'population' || !origin) {
    if (cellsWanted && at) {
      // Only the cell at the coordinates can pass `location2D`, which is still tested.
      const [x, y] = at();
      const cell = (space as GridInstance).grid.at(x, y);
      return cell ? [cell] : [];
    }
    if (cellsWanted) return (space as GridInstance).scape.members;
    return type ? populationOf(type, origin ?? root, state) : [];
  }
  if (space instanceof GridInstance) {
    if (!from) return [];
    const cell = from as Cell;
    let cells: readonly Cell[];
    if (generator === 'here') cells = [cell];
    else if (generator === 'neighbor') {
      cells = includeSelf ? [...space.grid.neighbors(cell), cell] : space.grid.neighbors(cell);
    } else if (generator === 'sight') {
      const seen = space.grid.rays(cell, sight!());
      cells = includeSelf ? [cell, ...seen] : seen;
    } else {
      cells = space.within(cell, radius!());
    }
    if (cellsWanted) return cells;
    return occupants(cells);
  }
  if (space instanceof NetworkInstance) {
    let nodes: readonly Agent[];
    if (generator === 'here') nodes = [origin];
    else if (generator === 'neighbor') {
      nodes = includeSelf
        ? [...space.graph.neighbors(origin), origin]
        : space.graph.neighbors(origin);
    } else {
      nodes = space.graph.findWithin(origin, (sight ?? radius)!(), { includeSelf });
    }
    return ofType(nodes);
  }
  return type ? populationOf(type, origin, state) : [];
}

/** The compiled acts of an agent or of one of its styles. */
export class Behaviour {
  /** The rule, schedule and diffuse acts, in the order written. */
  readonly rules: { readonly id: ActId; readonly act: FlowAct }[] = [];
  readonly initializers: { readonly id: ActId; readonly act: FlowAct }[] = [];
  readonly builds: { readonly id: ActId; readonly act: FlowAct }[] = [];
  /** The watch acts of each attribute, by attribute reference. */
  readonly watches = new Map<string, ActId[]>();
  /** The derive act of each derived attribute, by attribute reference. */
  readonly derives = new Map<string, ActId>();
  /** The shape the style first gives, for views that need one shape per agent type. */
  readonly firstShape: 'oval' | 'rectangle' | undefined;
  readonly #nodes = new Map<ActId, Node>();

  constructor(
    readonly index: ModelIndex,
    /** The agent whose acts these are (for a style, the styled agent). */
    readonly owner: AgentInfo,
    group: Record<ActId, Act> | undefined,
    readonly functions: ReadonlyMap<string, FunctionEntry>,
    /** The constants of the function library, by ID. */
    readonly constants: ReadonlyMap<string, Constant> = new Map(),
    /** The implementations of the method acts, by act path. A method without one does nothing. */
    readonly methods: ReadonlyMap<ActId, MethodImplementation> = new Map(),
  ) {
    const acts = actsOf(group);
    acts.forEach(([id, act], order) => {
      this.#nodes.set(id, {
        id,
        act,
        order,
        role: roleOf(act),
        targets: [],
        sources: [],
        topo: 0,
        region: undefined,
        units: [],
        fire: () => {},
      });
    });
    for (const node of this.#nodes.values()) {
      for (const target of node.act.targets ?? []) {
        const to = this.#nodes.get(target)!;
        node.targets.push(to);
        to.sources.push(node);
      }
    }
    const ordered = this.#topologicalOrder();
    this.#regions(ordered);
    this.#compileNodes(ordered);
    this.#wireUnits(ordered);

    let firstShape: 'oval' | 'rectangle' | undefined;
    for (const node of ordered) {
      const act = node.act;
      switch (act.kind) {
        case 'rule':
        case 'schedule':
        case 'diffuse':
          this.rules.push({ id: node.id, act });
          break;
        case 'initialize':
          this.initializers.push({ id: node.id, act });
          break;
        case 'build':
          this.builds.push({ id: node.id, act });
          break;
        case 'watch':
          this.#listFor(this.watches, act.attribute).push(node.id);
          break;
        case 'derive':
          this.derives.set(act.attribute, node.id);
          break;
        case 'evaluate':
          if (firstShape === undefined && act.function === 'shapeOval') firstShape = 'oval';
          if (firstShape === undefined && act.function === 'shapeRectangle')
            firstShape = 'rectangle';
          break;
        default:
          break;
      }
    }
    // Rules run in the order the acts are written (R14), not the order flows run.
    for (const list of [this.rules, this.initializers, this.builds]) {
      list.sort((a, b) => this.#nodes.get(a.id)!.order - this.#nodes.get(b.id)!.order);
    }
    this.firstShape = firstShape;
  }

  /**
   * Root acts whose flows run as generated code (docs/codegen.md), by ID;
   * the others are interpreted.
   */
  readonly generated = new Map<ActId, (agent: Agent, state: RunState) => void>();
  /** Why root acts that were to be generated are interpreted instead, by ID. */
  readonly interpretedBecause = new Map<ActId, string>();

  /** Every act, by its path. */
  get nodes(): ReadonlyMap<ActId, Node> {
    return this.#nodes;
  }

  /** Runs the flow of a root act for an agent. */
  run(rootId: ActId, agent: Agent, state: RunState): void {
    const generated = this.generated.get(rootId);
    if (generated) {
      generated(agent, state);
      return;
    }
    const node = this.#nodes.get(rootId);
    if (!node) throw new Error(`Internal error: no act \`${rootId}\``);
    const frame = new Frame(state, undefined, rootId, agent, undefined, agent.random);
    runUnits(node.units, frame);
  }

  /** Runs a derive act for an agent and returns the value of the last evaluate its flow reaches. */
  derive(rootId: ActId, agent: Agent, state: RunState): Datum | undefined {
    const outer = state.capture;
    const capture: { value: Datum | undefined } = { value: undefined };
    state.capture = capture;
    try {
      this.run(rootId, agent, state);
    } finally {
      state.capture = outer;
    }
    return capture.value;
  }

  /** Works out how an agent looks, from this style's rules. */
  style(agent: Agent, state: RunState): StyleAccumulator {
    const outer = state.style;
    const style = new StyleAccumulator();
    state.style = style;
    try {
      for (const rule of this.rules) this.run(rule.id, agent, state);
    } finally {
      state.style = outer;
    }
    return style;
  }

  /** The space a leave act's selection is made in. */
  leaveSpace(node: Node): SpaceInfo | undefined {
    const act = node.act as Extract<FlowAct, { kind: 'leave' }>;
    const selection = this.#nodes.get(act.selected)!.act;
    const spaceId = 'space' in selection ? selection.space : undefined;
    return spaceId ? (this.index.owners.get(spaceId) as SpaceInfo) : undefined;
  }

  readonly #methodRunners = new Map<Node, MethodRunner | undefined>();

  /** What runs a method act; undefined if it has no implementation. */
  methodRunner(node: Node): MethodRunner | undefined {
    if (!this.#methodRunners.has(node)) {
      const implementation = this.methods.get(node.id);
      this.#methodRunners.set(node, implementation && createMethod(implementation, node.id));
    }
    return this.#methodRunners.get(node);
  }

  #listFor(map: Map<string, ActId[]>, key: string): ActId[] {
    let list = map.get(key);
    if (!list) map.set(key, (list = []));
    return list;
  }

  // ─────────────────────────────── Graph ───────────────────────────────

  /** Upstream first; among acts free to go, the one written first. */
  #topologicalOrder(): Node[] {
    const remaining = new Map<Node, number>();
    for (const node of this.#nodes.values()) remaining.set(node, node.sources.length);
    const ready = [...this.#nodes.values()].filter((node) => node.sources.length === 0);
    const ordered: Node[] = [];
    while (ready.length > 0) {
      ready.sort((a, b) => a.order - b.order);
      const node = ready.shift()!;
      node.topo = ordered.length;
      ordered.push(node);
      for (const target of node.targets) {
        const left = remaining.get(target)! - 1;
        remaining.set(target, left);
        if (left === 0) ready.push(target);
      }
    }
    return ordered;
  }

  /** Whether a query's function is a spatial term. */
  isSpatial(node: Node): boolean {
    return (
      node.act.kind === 'query' && this.functions.get(node.act.function)?.impl.kind === 'spatial'
    );
  }

  /** The spatial term a query is, if it is one. */
  termOf(node: Node): SpatialTerm | undefined {
    if (node.act.kind !== 'query') return undefined;
    const impl = this.functions.get(node.act.function)?.impl;
    return impl?.kind === 'spatial' ? impl.term : undefined;
  }

  /**
   * A select's region: the select, the queries reached from it through
   * queries alone (a query that is not spatial only straight from the
   * select), and the logic acts fed only by those. Past a logic act, queries
   * filter what was chosen (R18); so does a query that is not spatial and
   * follows another query, as the generators had it (the Demographic
   * Prisoner's Dilemma tests the strategy of the neighbour chosen).
   */
  #regions(ordered: readonly Node[]): void {
    for (const select of ordered) {
      if (select.role !== 'select') continue;
      const members = new Set<Node>([select]);
      const region: Region = { select, members, exits: [] };
      select.region = region;
      for (const node of ordered) {
        if (node.topo <= select.topo || node.role !== 'control') continue;
        const act = node.act as Extract<FlowAct, { selected: ActId }>;
        if (act.selected !== select.id) continue;
        const fed = node.sources.every(
          (source) => source === select || (members.has(source) && source.act.kind === 'query'),
        );
        if (!fed) continue;
        if (act.kind === 'query') {
          const direct = node.sources.every((source) => source === select);
          if (!direct && !this.isSpatial(node)) continue;
        }
        members.add(node);
        node.region = region;
      }
    }
  }

  // ─────────────────────────────── Values ───────────────────────────────

  #typeOfEvaluate(node: Node, seen = new Set<Node>()): ValueType {
    const act = node.act;
    if (act.kind !== 'evaluate' || seen.has(node)) return 'generic';
    seen.add(node);
    const entry = this.functions.get(act.function);
    if (!entry) return 'generic';
    const types = withConstants(
      act.inputs ?? [],
      (act.inputs ?? []).map((input) =>
        'multiValue' in input ? 'generic' : this.#valueType(input, seen),
      ),
    );
    if (act.function === 'randomState') return types[0] ?? 'generic';
    return resultType(entry.fn, types);
  }

  #valueType(value: Value, seen = new Set<Node>()): ValueType {
    if ('attribute' in value) return this.index.attribute(value.attribute).type;
    if ('option' in value) return `state:${value.option.slice(0, value.option.lastIndexOf('.'))}`;
    if ('evaluate' in value) return this.#typeOfEvaluate(this.#nodes.get(value.evaluate)!, seen);
    // A numeric constant takes the type of where it is used.
    if ('constant' in value) return this.constants.get(value.constant)?.type ?? 'generic';
    return value.type ?? literalType(value.literal);
  }

  /** Compiles a value read on a frame. `selected` is the act's own selection, for attributes that name none. */
  #value(value: Value, selected: ActId): Getter {
    const type = this.#valueType(value);
    const info = { type };
    if ('attribute' in value) {
      const attribute = this.index.attribute(value.attribute);
      const owner = attribute.owner;
      // From the selection the value names, else the act's own (D7); an
      // attribute of a scape or space from the one around that agent.
      const from = value.selected ?? selected;
      return {
        type,
        info,
        get: (frame) =>
          frame.state.read(holderFor(frame.agentOf(from), owner, frame.state), attribute),
      };
    }
    if ('option' in value) {
      const option = value.option.slice(value.option.lastIndexOf('.') + 1);
      return { type, info, get: () => option };
    }
    if ('evaluate' in value) {
      const node = this.#nodes.get(value.evaluate)!;
      return { type, info, get: (frame) => this.#evaluated(node, frame) as Datum };
    }
    if ('constant' in value) {
      const constant = this.constants.get(value.constant);
      if (!constant) throw new Error(`No constant \`${value.constant}\` in the function library`);
      const datum = constant.value;
      return { type, info, get: () => datum };
    }
    const literal = value.literal;
    return { type, info, get: () => literal };
  }

  /**
   * A set's parameter. An attribute of an agent with no selection named is
   * read from the agent the flow runs for, the root act's, if it holds the
   * attribute, as the generators read it (`selfrom(ASet)` is the root's
   * selection): a child created in Demographic Prisoner's Dilemma takes its
   * parent's strategy. Otherwise as any value.
   */
  #setParameter(value: Value, selected: ActId): Getter {
    const getter = this.#value(value, selected);
    if (!('attribute' in value) || value.selected !== undefined) return getter;
    const attribute = this.index.attribute(value.attribute);
    if (attribute.owner.kind !== 'agent') return getter;
    return {
      ...getter,
      get: (frame) => {
        const root = frame.root.agent;
        return isHolder(root) && root.info === attribute.owner
          ? frame.state.read(root, attribute)
          : getter.get(frame);
      },
    };
  }

  #input(input: Input, selected: ActId): Getter {
    if (!('multiValue' in input)) return this.#value(input, selected);
    const attributes = input.multiValue.map((ref) => this.index.attribute(ref));
    const type = combineTypes(attributes.map((attribute) => attribute.type));
    return {
      type,
      info: { type, options: attributes.map((attribute) => attribute.options) },
      get: (frame) => {
        const bound = frame.agentOf(selected);
        return attributes.map((attribute) =>
          frame.state.read(holderFor(bound, attribute.owner, frame.state), attribute),
        );
      },
    };
  }

  /** The value of an evaluate on a path: remembered if it has fired, else worked out now. */
  #evaluated(node: Node, frame: Frame): Datum | undefined {
    const key = `e:${node.id}`;
    const known = frame.recall(key);
    if (known) return known.value;
    const value = this.#call(node)(frame);
    frame.remember(key, value);
    return value;
  }

  readonly #calls = new Map<Node, (frame: Frame) => Datum | undefined>();

  /** Compiles a query's or evaluate's function call on a frame. */
  #call(node: Node): (frame: Frame) => Datum | undefined {
    const known = this.#calls.get(node);
    if (known) return known;
    const act = node.act as Extract<FlowAct, { kind: 'query' | 'evaluate' }>;
    const entry = this.functions.get(act.function);
    if (!entry) throw new Error(`No implementation of function \`${act.function}\``);
    const inputs = (act.inputs ?? []).map((input) => this.#input(input, act.selected));
    let call: (frame: Frame) => Datum | undefined;
    if (entry.impl.kind === 'spatial') {
      call = this.#spatialValue(node, entry.impl.term, inputs);
    } else if (act.function === 'original') {
      call = this.#original(act.inputs?.[0], act.selected, inputs[0]);
    } else {
      const compiled = this.compiledCall(node);
      call = (frame) =>
        compiled(
          inputs.map((input) => input.get(frame)),
          { random: frame.random, period: frame.state.period, style: frame.state.style },
        );
    }
    this.#calls.set(node, call);
    return call;
  }

  readonly #compiled = new Map<Node, { info: CallInfo; call: Call }>();

  /** What a value function is told of a query's or evaluate's call, and the function made for it. */
  callInfo(node: Node): CallInfo {
    return this.#compiledOf(node).info;
  }

  /** The function made for a query's or evaluate's call of a value function. */
  compiledCall(node: Node): Call {
    return this.#compiledOf(node).call;
  }

  #compiledOf(node: Node): { info: CallInfo; call: Call } {
    let found = this.#compiled.get(node);
    if (!found) {
      const act = node.act as Extract<FlowAct, { kind: 'query' | 'evaluate' }>;
      const entry = this.functions.get(act.function);
      if (!entry || entry.impl.kind !== 'value') {
        throw new Error(`Internal error: \`${act.function}\` is not a value function`);
      }
      const inputs = (act.inputs ?? []).map((input) => this.#input(input, act.selected));
      const types = withConstants(
        act.inputs ?? [],
        inputs.map((input) => input.type),
      );
      const info: CallInfo = {
        inputs: inputs.map((input, i) => ({ ...input.info, type: types[i] ?? input.type })),
        optionsOf: (type) => this.index.optionsOf(type),
      };
      found = { info, call: entry.impl.compile(info) };
      this.#compiled.set(node, found);
    }
    return found;
  }

  /** `original`: the value an attribute had when its agent started. */
  #original(
    input: Input | undefined,
    selected: ActId,
    getter: Getter | undefined,
  ): (frame: Frame) => Datum | undefined {
    if (!input || !getter) return () => 0;
    if (!('attribute' in input)) return (frame) => getter.get(frame) as Datum;
    const attribute = this.index.attribute(input.attribute);
    const from = input.selected ?? selected;
    return (frame) => {
      const holder = holderFor(frame.agentOf(from), attribute.owner, frame.state);
      return holder.originals?.[attribute.index] ?? frame.state.read(holder, attribute);
    };
  }

  /** A spatial function used for its value outside a region: `distance`, or a term used as a filter. */
  #spatialValue(node: Node, term: SpatialTerm, inputs: readonly Getter[]): (frame: Frame) => Datum {
    const act = node.act as Extract<FlowAct, { kind: 'query' | 'evaluate' }>;
    const selection = this.#nodes.get(act.selected)!;
    const selectAct = selection.act.kind === 'select' ? selection.act : undefined;
    const spaceInfo =
      selectAct?.space !== undefined
        ? (this.index.owners.get(selectAct.space) as SpaceInfo)
        : 'space' in selection.act && selection.act.space !== undefined
          ? (this.index.owners.get(selection.act.space) as SpaceInfo)
          : undefined;
    const envOf = (frame: Frame): Env => {
      const bound = frame.agentOf(selection.id);
      const origin = selectAct ? frame.agentOf(selectAct.selected) : undefined;
      const space = spaceInfo ? spaceAround(origin ?? bound, spaceInfo, frame.state) : undefined;
      return new Env(frame, selection.id, undefined, origin, space, false);
    };
    switch (term) {
      case 'distance':
        return (frame) => {
          const env = envOf(frame);
          const bound = frame.agentOf(selection.id);
          return env.origin && env.space ? (env.space.distance(env.origin, bound) ?? 0) : 0;
        };
      case 'neighbor':
        return (frame) => envOf(frame).isNeighbor(frame.agentOf(selection.id));
      case 'here':
        return (frame) => envOf(frame).isHere(frame.agentOf(selection.id));
      case 'available':
        return (frame) => envOf(frame).isAvailable(frame.agentOf(selection.id));
      case 'within':
        return (frame) =>
          envOf(frame).isWithin(frame.agentOf(selection.id), num(inputs[0]?.get(frame)));
      case 'lineOfSight':
        return (frame) =>
          envOf(frame).isInLine(frame.agentOf(selection.id), num(inputs[0]?.get(frame)));
      case 'locationX':
      case 'locationY':
        return (frame) => {
          const { space } = envOf(frame);
          const at = locate(space, frame.agentOf(selection.id));
          return at instanceof LocatedAgent ? (term === 'locationX' ? at.x : at.y) : 0;
        };
      case 'location2D':
        return (frame) =>
          envOf(frame).isAt(
            frame.agentOf(selection.id),
            num(inputs[0]?.get(frame)),
            num(inputs[1]?.get(frame)),
          );
      default:
        // Cardinality terms and modifiers choose; on what is already chosen they pass it.
        return () => true;
    }
  }

  // ───────────────────────────── Regions ─────────────────────────────

  readonly #logicPredicates = new Map<Node, CandidatePredicate | undefined>();

  /**
   * What the queries that are not spatial, and the logic acts, of a region
   * ask of a candidate reaching a node; undefined if they ask nothing. Spatial
   * terms say where to look and how many to choose, as the generators had
   * them: they are not operands of logic acts (a `none` beside an `all` term
   * takes every candidate the other queries reject).
   */
  #logicOnCandidate(node: Node, region: Region): CandidatePredicate | undefined {
    if (this.#logicPredicates.has(node)) return this.#logicPredicates.get(node);
    let predicate: CandidatePredicate | undefined;
    if (node !== region.select) {
      const sources = node.sources
        .map((source) => this.#logicOnCandidate(source, region))
        .filter((source): source is CandidatePredicate => source !== undefined);
      const reached: CandidatePredicate | undefined =
        sources.length === 0
          ? undefined
          : sources.length === 1
            ? sources[0]!
            : (candidate, env) => sources.some((source) => source(candidate, env));
      switch (node.act.kind) {
        case 'query': {
          if (this.isSpatial(node)) {
            predicate = reached;
          } else {
            const own = this.#queryOnCandidate(node);
            predicate = reached
              ? (candidate, env) => own(candidate, env) && reached(candidate, env)
              : own;
          }
          break;
        }
        case 'all':
          predicate =
            sources.length === 0
              ? undefined
              : (candidate, env) => sources.every((source) => source(candidate, env));
          break;
        case 'any':
          predicate = reached;
          break;
        default:
          predicate = reached ? (candidate, env) => !reached(candidate, env) : undefined;
      }
    }
    this.#logicPredicates.set(node, predicate);
    return predicate;
  }

  #queryOnCandidate(node: Node): CandidatePredicate {
    const act = node.act as Extract<FlowAct, { kind: 'query' }>;
    const term = this.termOf(node);
    if (term === undefined) {
      const call = this.#call(node);
      return (candidate, env) => call(env.frameFor(candidate)) === true;
    }
    const inputs = (act.inputs ?? []).map((input) => this.#input(input, act.selected));
    switch (term) {
      case 'neighbor':
        return (candidate, env) => env.isNeighbor(candidate);
      case 'within':
        return (candidate, env) =>
          env.isWithin(candidate, num(inputs[0]?.get(env.frameFor(candidate))));
      case 'lineOfSight':
        return (candidate, env) =>
          env.isInLine(candidate, num(inputs[0]?.get(env.frameFor(candidate))));
      case 'here':
        return (candidate, env) => env.isHere(candidate);
      case 'available':
        return (candidate, env) => env.isAvailable(candidate);
      case 'location2D':
        return (candidate, env) => {
          const frame = env.frameFor(candidate);
          return env.isAt(candidate, num(inputs[0]?.get(frame)), num(inputs[1]?.get(frame)));
        };
      default:
        return () => true;
    }
  }

  /** The members of a region upstream of a node, the node included. */
  #upstream(node: Node, region: Region): Set<Node> {
    const found = new Set<Node>();
    const visit = (at: Node) => {
      if (found.has(at) || !region.members.has(at)) return;
      found.add(at);
      for (const source of at.sources) visit(source);
    };
    visit(node);
    return found;
  }

  #exit(node: Node, region: Region): Exit {
    const select = region.select;
    const selectAct = select.act as SelectAct;
    const upstream = this.#upstream(node, region);
    const terms = new Map<SpatialTerm, Node>();
    for (const member of upstream) {
      const term = this.termOf(member);
      if (term !== undefined && !terms.has(term)) terms.set(term, member);
    }
    const cardinality: Cardinality = terms.has('nearest')
      ? 'nearest'
      : terms.has('minimize')
        ? 'minimize'
        : terms.has('maximize')
          ? 'maximize'
          : terms.has('all')
            ? 'all'
            : 'one';
    const every = terms.has('all');
    const includeSelf = terms.has('includeSelf');
    const locating = [...terms.keys()].some((term) => LOCATING_TERMS.has(term));
    const here = terms.has('here');
    const type =
      selectAct.agent !== undefined
        ? (this.index.owners.get(selectAct.agent) as AgentInfo)
        : undefined;

    // A radius the search can use: one that does not depend on the candidate.
    const fixedInput = (term: SpatialTerm): Input | undefined => {
      const termNode = terms.get(term);
      const input = termNode && (termNode.act as Extract<FlowAct, { kind: 'query' }>).inputs?.[0];
      const fixed =
        input !== undefined &&
        !('multiValue' in input) &&
        !('attribute' in input && (input.selected ?? select.id) === select.id);
      return fixed ? input : undefined;
    };
    const radius = fixedInput('within');
    const sight = fixedInput('lineOfSight');
    const atInputs = (terms.get('location2D')?.act as Extract<FlowAct, { kind: 'query' }>)?.inputs;
    const plain = (input: Input | undefined): input is Input =>
      input !== undefined &&
      !('multiValue' in input) &&
      !('evaluate' in input) &&
      !('attribute' in input && (input.selected ?? select.id) === select.id);
    const at =
      atInputs && plain(atInputs[0]) && plain(atInputs[1])
        ? ([atInputs[0], atInputs[1]] as const)
        : undefined;
    const generator: Generator = terms.has('here')
      ? 'here'
      : terms.has('neighbor')
        ? 'neighbor'
        : sight
          ? 'sight'
          : radius
            ? 'within'
            : 'population';
    // On a grid, the search around the origin finds only cells (or their
    // occupants) that pass the generator's own term, so it need not be tested.
    const generatorTerm: SpatialTerm | undefined =
      generator === 'sight' ? 'lineOfSight' : generator === 'population' ? undefined : generator;
    const generatorNode = generatorTerm && terms.get(generatorTerm);
    const filters = [...upstream]
      .filter((member) => {
        const term = this.termOf(member);
        return term !== undefined && FILTER_TERMS.has(term);
      })
      .map((member) => ({ node: member, implied: member === generatorNode }));
    const score =
      cardinality === 'minimize' || cardinality === 'maximize'
        ? (terms.get(cardinality)!.act as Extract<FlowAct, { kind: 'query' }>).inputs?.[0]
        : undefined;

    const exit: Exit = {
      node,
      region,
      upstream,
      terms,
      cardinality,
      every,
      includeSelf,
      locating,
      here,
      toward: terms.has('toward'),
      away: terms.has('away'),
      type,
      generator,
      radius,
      sight,
      at,
      filters,
      score,
      ranked: cardinality === 'nearest' && generator === 'population' && at === undefined,
      units: [],
      choose: () => [],
    };

    // Spatial filters upstream of the exit all hold; the other queries combine as their logic acts say.
    const filterTests = filters.map(({ node: member, implied }) => ({
      test: this.#queryOnCandidate(member),
      implied,
    }));
    const logic = this.#logicOnCandidate(node, region);
    const radiusGetter = radius && this.#input(radius, select.id);
    const sightGetter = sight && this.#input(sight, select.id);
    const atGetters = at && [this.#input(at[0], select.id), this.#input(at[1], select.id)];

    let scoreOf: ((candidate: Agent, env: Env) => number) | undefined;
    if (cardinality === 'nearest') {
      scoreOf = (candidate, env) =>
        env.space && env.origin
          ? (env.space.distance(env.origin, candidate) ?? Infinity)
          : Infinity;
    } else if (cardinality === 'minimize' || cardinality === 'maximize') {
      const getter = score ? this.#input(score, select.id) : undefined;
      const sign = cardinality === 'minimize' ? 1 : -1;
      scoreOf = (candidate, env) => sign * num(getter?.get(env.frameFor(candidate)) ?? 0);
    }

    exit.choose = (env) => {
      const onGrid = searchesGrid(exit, env.space, env.origin, env.originLocation);
      const passes = (candidate: Agent): boolean => {
        if (!candidate.alive) return false;
        if (locating && !includeSelf && env.origin !== undefined) {
          if (candidate === env.origin) return false;
          if (!here && candidate === env.originLocation) return false;
        }
        return (
          filterTests.every(({ test, implied }) => (implied && onGrid) || test(candidate, env)) &&
          (!logic || logic(candidate, env))
        );
      };
      let found: Agent[];
      if (searchesRanks(exit, env.space, env.originLocation)) {
        found = nearestCells(env.space, env.originLocation!, passes);
      } else {
        found = [];
        const candidates = exitCandidates(
          exit,
          env.space,
          env.origin,
          env.originLocation,
          env.frame.root.agent,
          env.frame.state,
          radiusGetter && (() => num(radiusGetter.get(env.frame))),
          sightGetter && (() => num(sightGetter.get(env.frame))),
          atGetters &&
            (() => [num(atGetters[0]!.get(env.frame)), num(atGetters[1]!.get(env.frame))]),
        );
        for (const candidate of candidates) if (passes(candidate)) found.push(candidate);
      }
      if (found.length === 0) return found;
      if (scoreOf) {
        let best = Infinity;
        let ties: Agent[] = [];
        for (const candidate of found) {
          const value = scoreOf(candidate, env);
          if (value < best) {
            best = value;
            ties = [candidate];
          } else if (value === best) {
            ties.push(candidate);
          }
        }
        if (ties.length === 0) return ties;
        return every ? ties : [env.frame.random.pick(ties)];
      }
      if (every) return found;
      return [env.frame.random.pick(found)];
    };
    return exit;
  }

  // ───────────────────────────── Predicates ─────────────────────────────

  readonly #framePredicates = new Map<Node, (frame: Frame) => boolean>();

  /** Whether a frame reaches a query or logic act outside a region. */
  #framePredicate(node: Node): (frame: Frame) => boolean {
    const known = this.#framePredicates.get(node);
    if (known) return known;
    const sources = node.sources.map((source) => this.#sourcePredicate(source));
    const reached = (frame: Frame) => sources.some((source) => source(frame));
    let predicate: (frame: Frame) => boolean;
    switch (node.act.kind) {
      case 'query': {
        const call = this.#call(node);
        const key = `q:${node.id}`;
        predicate = (frame) => {
          if (!reached(frame)) return false;
          const known = frame.own(key);
          if (known) return known.value === true;
          const value = call(frame);
          frame.remember(key, value);
          return value === true;
        };
        break;
      }
      case 'all':
        predicate = (frame) => sources.every((source) => source(frame));
        break;
      case 'any':
        predicate = reached;
        break;
      default:
        predicate = (frame) => !reached(frame);
    }
    this.#framePredicates.set(node, predicate);
    return predicate;
  }

  #sourcePredicate(source: Node): (frame: Frame) => boolean {
    const region = source.region;
    if (region && source !== region.select) {
      // Reached if the agent the select is bound to was chosen at or past this node.
      const selectId = region.select.id;
      return (frame) => {
        const exit = frame.find(selectId)?.exit;
        return exit !== undefined && exit.upstream.has(source);
      };
    }
    if (source.role === 'control') return this.#framePredicate(source);
    return () => true;
  }

  // ───────────────────────────── Statements ─────────────────────────────

  #compileNodes(ordered: readonly Node[]): void {
    for (const node of ordered) {
      if (node.role === 'select') {
        const region = node.region!;
        for (const member of [...region.members].sort((a, b) => a.topo - b.topo)) {
          if (member.targets.some((target) => !region.members.has(target))) {
            region.exits.push(this.#exit(member, region));
          }
        }
        node.fire = this.#select(node);
      } else if (node.role === 'create') {
        node.fire = this.#create(node);
      } else if (node.role === 'statement') {
        node.fire = this.#statement(node);
      }
    }
  }

  #emit(node: Node, frame: Frame): void {
    runUnits(node.units, frame);
  }

  #select(node: Node): (frame: Frame) => void {
    const act = node.act as SelectAct;
    const region = node.region!;
    const space =
      act.space !== undefined ? (this.index.owners.get(act.space) as SpaceInfo) : undefined;
    return (frame) => {
      const state = frame.state;
      state.looked();
      const origin = frame.agentOf(act.selected);
      const instance = space ? spaceAround(origin, space, state) : undefined;
      for (const exit of region.exits) {
        const env = new Env(frame, node.id, exit, origin, instance, exit.includeSelf);
        for (const chosen of exit.choose(env)) {
          if (!chosen.alive) continue;
          const child = new Frame(state, frame, node.id, chosen, exit, frame.random);
          runUnits(exit.units, child);
        }
      }
    };
  }

  #create(node: Node): (frame: Frame) => void {
    const act = node.act as Extract<FlowAct, { kind: 'create' }>;
    const type = this.index.owners.get(act.agent) as AgentInfo;
    const count = act.agentCount ? this.#value(act.agentCount, act.selected) : undefined;
    return (frame) => {
      const state = frame.state;
      const n = count ? Math.trunc(num(count.get(frame))) : 1;
      if (n <= 0 || !type.context) return;
      const scape = instancesOf(frame.agentOf(act.selected), type.context, state)[0];
      if (!scape) return;
      for (let i = 0; i < n; i++) {
        const agent = state.create(type, scape);
        if (!agent) break;
        const child = new Frame(state, frame, node.id, agent, undefined, frame.random);
        this.#emit(node, child);
        if (isHolder(agent) && state.keepsOriginals) agent.originals = [...agent.values];
      }
    };
  }

  #statement(node: Node): (frame: Frame) => void {
    const act = node.act;
    const index = this.index;
    switch (act.kind) {
      case 'evaluate': {
        const call = this.#call(node);
        const key = `e:${node.id}`;
        const terminal = node.targets.length === 0;
        return (frame) => {
          const value = call(frame);
          frame.remember(key, value);
          if (terminal && frame.state.capture && value !== undefined) {
            frame.state.capture.value = value;
          }
          this.#emit(node, frame);
        };
      }
      case 'set': {
        const attribute = index.attribute(act.attribute);
        const parameter = this.#setParameter(act.parameter, act.selected);
        return (frame) => {
          const value = parameter.get(frame) as Datum;
          const holder = holderFor(frame.agentOf(act.selected), attribute.owner, frame.state);
          frame.state.write(holder, attribute, value);
          this.#emit(node, frame);
        };
      }
      case 'move':
        return (frame) => {
          const destination = frame.find(act.destination);
          if (destination) {
            move(
              frame.agentOf(act.selected),
              destination.agent,
              destination.exit?.toward ?? false,
              destination.exit?.away ?? false,
              frame.state,
            );
          }
          this.#emit(node, frame);
        };
      case 'leave': {
        const space = this.leaveSpace(node);
        return (frame) => {
          leave(frame.agentOf(act.selected), space, frame.state);
          this.#emit(node, frame);
        };
      }
      case 'die':
        return (frame) => {
          die(frame.agentOf(act.selected), frame.state);
          this.#emit(node, frame);
        };
      case 'connect':
      case 'replace':
      case 'disconnect': {
        const network = index.owners.get(act.within) as SpaceInfo;
        const directed = act.kind === 'disconnect' ? true : (act.directed ?? true);
        return (frame) => {
          const agent = frame.agentOf(act.selected);
          link(act.kind, agent, network, directed, frame.state, () =>
            frame.agentOf((act as Extract<FlowAct, { destination: ActId }>).destination),
          );
          this.#emit(node, frame);
        };
      }
      case 'cause':
        return (frame) => {
          const agent = frame.agentOf(act.selected);
          frame.state.trigger(`\`${node.id}\``, () => this.run(act.result, agent, frame.state));
          this.#emit(node, frame);
        };
      case 'method': {
        const runner = this.methodRunner(node);
        return (frame) => {
          const agent = act.selected !== undefined ? frame.agentOf(act.selected) : frame.root.agent;
          runner?.(agent, frame.state, frame.random);
          this.#emit(node, frame);
        };
      }
      default:
        // Builders: the spaces are made before the build acts run.
        return (frame) => this.#emit(node, frame);
    }
  }

  // ─────────────────────────────── Units ───────────────────────────────

  /** What the flow goes on to from each act: the acts after it, and the gates it is the last feeder of. */
  #wireUnits(ordered: readonly Node[]): void {
    const isGate = (node: Node) =>
      node.role === 'control' &&
      !node.region &&
      node.targets.some((target) => target.role !== 'control');
    const statementUnit = (target: Node): Unit => ({ kind: 'fire', topo: target.topo, target });
    const exitOf = new Map<Node, Exit>();
    for (const node of ordered)
      for (const exit of node.region?.select === node ? node.region.exits : []) {
        exitOf.set(exit.node, exit);
      }
    const unitsOf = (node: Node): Unit[] => {
      const exit = exitOf.get(node);
      return exit ? exit.units : node.units;
    };

    // The acts after each act, outside its region.
    for (const node of ordered) {
      const outside = node.region
        ? node.targets.filter((target) => !node.region!.members.has(target))
        : node.targets;
      if (node.role === 'control' && !exitOf.has(node)) continue;
      if (node.role === 'select' && !exitOf.has(node)) continue;
      const units = unitsOf(node);
      for (const target of outside)
        if (target.role !== 'control') units.push(statementUnit(target));
    }

    // Each gate: a query fires for every arrival, as a plain act does; a logic act, and
    // anything after one, once, at the last act that feeds it, where all it combines is bound.
    for (const gate of ordered) {
      if (!isGate(gate)) continue;
      const feeders = new Set<Node>();
      let logic = LOGIC_KINDS.has(gate.act.kind);
      const visit = (node: Node) => {
        for (const source of node.sources) {
          if (source.role === 'control' && !source.region) {
            if (LOGIC_KINDS.has(source.act.kind)) logic = true;
            visit(source);
          } else feeders.add(source);
        }
      };
      visit(gate);
      const last = [...feeders].reduce((a, b) => (b.topo > a.topo ? b : a));
      const predicate = this.#framePredicate(gate);
      const after = gate.targets
        .filter((target) => target.role !== 'control')
        .sort((a, b) => a.topo - b.topo);
      const unit: Unit = { kind: 'gate', topo: gate.topo, gate, after, predicate };
      for (const feeder of logic ? [last] : feeders) unitsOf(feeder).push(unit);
    }
    for (const node of ordered) {
      node.units.sort((a, b) => a.topo - b.topo);
      exitOf.get(node)?.units.sort((a, b) => a.topo - b.topo);
    }
  }
}

/** Runs what a flow goes on to from one arrival: gates on a frame of their own, so that each arrival decides afresh. */
function runUnits(units: readonly Unit[], frame: Frame): void {
  let arrival: Frame | undefined;
  for (const unit of units) {
    if (unit.kind === 'fire') unit.target.fire(frame);
    else {
      arrival ??= frame.arrival();
      if (unit.predicate(arrival)) for (const target of unit.after) target.fire(arrival);
    }
  }
}

/** Takes an agent out of the space its selection is made in (a leave act). */
export function leave(agent: Agent, space: SpaceInfo | undefined, state: RunState): void {
  const instance = space ? spaceAround(agent, space, state) : undefined;
  if (instance instanceof NetworkInstance) {
    instance.scape.remove(agent);
  } else if (agent instanceof CellOccupant && !(instance instanceof ContinuousInstance)) {
    agent.leave();
  }
  state.restructured();
}

/** Ends an agent (a die act). */
export function die(agent: Agent, state: RunState): void {
  if (agent instanceof HostCell && !(agent instanceof CellOccupant)) {
    throw new Error(`${describe(agent)} is a cell of a grid; cells cannot die`);
  }
  if (agent.alive && agent !== state.scape) {
    agent.die();
    state.restructured();
  }
}

/** Connects, replaces the links of, or disconnects an agent in a network. */
export function link(
  kind: 'connect' | 'replace' | 'disconnect',
  agent: Agent,
  network: SpaceInfo,
  directed: boolean,
  state: RunState,
  destination: () => Agent,
): void {
  const instance = spaceAround(agent, network, state);
  if (instance instanceof NetworkInstance && agent.alive) {
    const graph = instance.graph;
    if (kind !== 'connect') graph.disconnectAll(agent);
    if (kind !== 'disconnect') {
      const other = destination();
      if (other.alive) {
        instance.enrol(agent);
        instance.enrol(other);
        graph.connect(agent, other);
        if (graph.directed && !directed) graph.connect(other, agent);
      }
    }
    state.restructured();
  }
}

/**
 * Moves an agent to the agent or cell bound by a destination selection,
 * toward or away from it if the exit that chose it says so.
 */
export function move(
  mover: Agent,
  target: Agent,
  toward: boolean,
  away: boolean,
  state: RunState,
): void {
  if (!mover.alive || !target.alive || !(mover instanceof CellOccupant)) return;
  if (mover instanceof InterpAgent && mover.info.continuous) {
    if (!(target instanceof LocatedAgent)) return;
    // One unit of distance per move, as a step on a grid is one cell.
    const space = mover.scape.space;
    if (toward) space.moveToward(mover, target, 1);
    else if (away) space.moveAway(mover, target, 1);
    else mover.moveTo(target.x, target.y);
    state.restructured();
    return;
  }
  const cell =
    target instanceof CellOccupant
      ? target.hostCell
      : target instanceof HostCell
        ? target
        : undefined;
  if (!cell) return;
  const multi = cell.scape.space.multiOccupancy;
  if (toward || away) {
    if (mover.hostCell?.scape !== cell.scape) return;
    if (toward) mover.moveToward(cell);
    else mover.moveAway(cell);
    state.restructured();
    return;
  }
  if (cell === mover.hostCell) return;
  if (!cell.isAvailable && !multi) return;
  const grid = state.grids.get(cell.scape as unknown as Scape<Cell>);
  if (mover instanceof InterpAgent && grid && grid.context !== mover.context) {
    // Moving into a grid of another scape: the agent joins that scape (as Ascape's generator did).
    const population = grid.context.populations.get(mover.info.id);
    if (!population) return;
    mover.die();
    mover.context = grid.context;
    population.add(mover);
  }
  mover.hostScape = cell.scape as unknown as Scape<HostCell>;
  mover.moveTo(cell);
  state.restructured();
}

/** Indexes a function library with the implementations of its functions. */
export function indexFunctions(
  library: {
    functions?: Record<string, LibraryFunction> | undefined;
    subs?: Record<string, unknown> | undefined;
  },
  implementations: Readonly<Record<string, FunctionImplementation>>,
): Map<string, FunctionEntry> {
  const found = new Map<string, FunctionEntry>();
  const visit = (lib: typeof library) => {
    for (const [id, fn] of Object.entries(lib.functions ?? {})) {
      const impl = implementations[id];
      if (impl) found.set(id, { fn, impl });
    }
    for (const sub of Object.values(lib.subs ?? {})) visit(sub as typeof library);
  };
  visit(library);
  return found;
}
