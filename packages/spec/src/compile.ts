// SPDX-License-Identifier: EPL-2.0
import {
  barsView,
  colors,
  connectRandom,
  connectRing,
  connectSmallWorld,
  ContinuousScape,
  continuousView,
  gridView,
  Network,
  networkView,
  Scape,
  timeSeriesView,
  type Agent,
  type Color,
  type Model,
  type Parameter,
  type ParameterSchema,
  type Rule,
  type Simulation,
  type Statistic,
} from '@metascape/engine';
import { actionKind, assertValidModel, recordedStatistics } from './check';
import { OPERATORS, operatorResult } from './operators';
import {
  applyPending,
  FramePool,
  OccupantScape,
  randomFreeCell,
  SpecCell,
  SpecGrid,
  SpecOccupant,
  SpecPlain,
  SpecPoint,
  World,
  type AgentKind,
  type Frame,
  type SpecAgent,
} from './runtime';
import type {
  Action,
  AggregateKind,
  Choice,
  Expression,
  ModelSpec,
  Operator,
  ParameterSpec,
  Selection,
} from './schema';
import {
  agentType,
  BOOLEAN,
  COLOR,
  describeModel,
  gridOf,
  INT,
  REAL,
  resolveReference,
  Scope,
  ScopeRoot,
  type AgentInfo,
  type ModelInfo,
  type SpaceInfo,
  type Type,
} from './types';

/*
 * The compiler translates a checked model ONCE into closures. Names are
 * resolved to attribute slots, frame slots and operator implementations
 * here; nothing looks a name up while a simulation runs. Values are typed at
 * compile time, so every closure returns either a number (int, real, colour,
 * state index), a boolean, or an agent.
 */

type NumFn = (f: Frame) => number;
type BoolFn = (f: Frame) => boolean;
type RefFn = (f: Frame) => SpecAgent | undefined;
type Act = (f: Frame) => void;
/** Called for each agent a selection finds, bound in the frame; returns true to stop. */
type Visit = (f: Frame) => boolean;
type Each = (f: Frame, visit: Visit) => void;

type Code =
  | { readonly kind: 'num'; readonly type: Type; readonly fn: NumFn }
  | { readonly kind: 'bool'; readonly type: Type; readonly fn: BoolFn }
  | { readonly kind: 'ref'; readonly type: Type; readonly fn: RefFn };

const numCode = (type: Type, fn: NumFn): Code => ({ kind: 'num', type, fn });
const boolCode = (fn: BoolFn): Code => ({ kind: 'bool', type: BOOLEAN, fn });
const refCode = (type: Type, fn: RefFn): Code => ({ kind: 'ref', type, fn });

function asNum(code: Code): NumFn {
  if (code.kind === 'num') return code.fn;
  if (code.kind === 'bool') {
    const fn = code.fn;
    return (f) => (fn(f) ? 1 : 0);
  }
  throw new Error('Internal error: an agent was used as a number');
}

function asBool(code: Code): BoolFn {
  if (code.kind === 'bool') return code.fn;
  throw new Error('Internal error: expected a boolean');
}

function asRef(code: Code): RefFn {
  if (code.kind === 'ref') return code.fn;
  throw new Error('Internal error: expected an agent');
}

const isStateLiteral = (e: Expression | undefined): boolean =>
  typeof e === 'object' && 'state' in e;

const DEFAULT_CELL_COLOR: Color = 0xeeeeee;
const PALETTE: readonly Color[] = [
  colors.blue,
  colors.red,
  colors.green,
  colors.orange,
  colors.purple,
  colors.teal,
  colors.pink,
  colors.brown,
  colors.yellow,
];
const WITH_ORIGIN = { includeSelf: true } as const;

interface CompiledSelection {
  readonly target: AgentInfo;
  /** The scope in which the found agent is bound. */
  readonly scope: Scope;
  readonly slot: number;
  readonly origin: RefFn | undefined;
  readonly originInfo: AgentInfo | undefined;
  readonly each: Each;
}

interface CompiledRule {
  readonly name: string;
  readonly execute: (agent: SpecAgent) => void;
  readonly synchronous: boolean;
}

interface CompiledType {
  readonly info: AgentInfo;
  readonly kind: AgentKind;
  readonly count: NumFn | undefined;
  readonly rules: readonly CompiledRule[];
  readonly initialize: ((agent: SpecAgent) => void) | undefined;
  readonly color: ((agent: SpecAgent) => Color) | undefined;
  readonly hidden: ((agent: SpecAgent) => boolean) | undefined;
}

/** Creates a function that runs an action list or expression in a pooled frame of `root`. */
function inFrame<T>(root: ScopeRoot, body: (f: Frame) => T): (agent: SpecAgent) => T {
  const pool = new FramePool(root);
  return (agent) => {
    const frame = pool.enter(agent, agent.world, agent.random);
    try {
      return body(frame);
    } finally {
      pool.exit();
    }
  };
}

/**
 * Compiles a model into an ordinary engine {@link Model}, which runs in
 * `Simulation`, `Runner`, experiments and the React views like any other.
 * Checks it with {@link assertValidModel} first.
 *
 * Mapping: parameters become engine parameters; a grid becomes a
 * `GridScape` of its cell type and a continuous space a `ContinuousScape`
 * per agent type in it; a network becomes a `Network` wired in `sim.setup`.
 * Each agent type is a scape named after it, and they step in declaration
 * order. Recorded attributes and populations become `sim.data` series, and
 * the spaces and charts become views.
 */
export function compileModel(spec: ModelSpec): Model {
  assertValidModel(spec);
  return new Compiler(spec).model();
}

class Compiler {
  readonly #info: ModelInfo;
  readonly #kinds: AgentKind[] = [];
  readonly #initials: (NumFn | undefined)[][] = [];
  readonly #initialRoots: ScopeRoot[] = [];

  constructor(readonly spec: ModelSpec) {
    this.#info = describeModel(spec);
  }

  model(): Model {
    const info = this.#info;
    // Kinds first: selections compare an agent's kind with the target's.
    for (const agent of info.agentList) this.#kinds.push(this.#kind(agent));
    const types = info.agentList.map((agent) => this.#type(agent));
    const constant = (label: string): Scope =>
      new Scope(new ScopeRoot(label, undefined, { constant: true }));
    const constantRoot = new ScopeRoot('constants', undefined, { constant: true });
    type Sizes =
      | { readonly width: NumFn; readonly height: NumFn }
      | { readonly k: NumFn | undefined; readonly probability: NumFn | undefined };
    const sizes = info.spaceList.map((space): Sizes => {
      const spec = space.spec;
      if (spec.kind === 'network') {
        const initial = spec.initial;
        return {
          k:
            initial && 'k' in initial
              ? asNum(this.#expr(initial.k, constant('k'), INT))
              : undefined,
          probability:
            initial && 'probability' in initial
              ? asNum(this.#expr(initial.probability, constant('probability'), REAL))
              : undefined,
        };
      }
      return {
        width: asNum(this.#expr(spec.width, constant('width'), INT)),
        height: asNum(this.#expr(spec.height, constant('height'), INT)),
      };
    });
    const stopWhen =
      this.spec.stopWhen === undefined
        ? undefined
        : this.#stopWhen(this.spec.stopWhen, new ScopeRoot('stopWhen', undefined));
    const constantPool = new FramePool(constantRoot);
    const parameters = toEngineParameters(this.spec.parameters ?? {});
    const spec = this.spec;

    const build = (sim: Simulation): void => {
      const world = new World(sim, info.parameterList.length, info.spaceList.length);
      for (const parameter of info.parameterList) {
        const value = sim.parameters[parameter.name];
        world.params[parameter.index] = typeof value === 'number' ? value : value === true ? 1 : 0;
      }
      const frame = constantPool.enter(undefined, world, sim.random);
      const networkSettings: { k: number; probability: number }[] = [];
      try {
        info.spaceList.forEach((space, index) => {
          const size = sizes[index]!;
          if ('width' in size) {
            world.widths[index] = size.width(frame);
            world.heights[index] = size.height(frame);
          } else {
            networkSettings[index] = {
              k: size.k?.(frame) ?? 0,
              probability: size.probability?.(frame) ?? 0,
            };
          }
        });
        types.forEach((type) => {
          const scape = this.#scape(type, world, type.count ? type.count(frame) : 0);
          for (const rule of type.rules) {
            const execute = rule.execute as (agent: Agent) => void;
            const engineRule: Rule<Agent> = rule.synchronous
              ? {
                  name: rule.name,
                  execute,
                  update: (agent) => applyPending(agent as SpecAgent),
                }
              : { name: rule.name, execute };
            scape.addRule(engineRule);
          }
          const initialize = type.initialize;
          if (initialize) {
            scape.addInitialRule('initialize', (agent) => initialize(agent as SpecAgent));
          }
          world.scapes[type.info.index] = sim.addScape(scape);
        });
      } finally {
        constantPool.exit();
      }

      for (const space of info.spaceList) {
        const spaceSpec = space.spec;
        if (spaceSpec.kind !== 'network') continue;
        const network = new Network<Agent>({ directed: spaceSpec.directed ?? false });
        world.networks[space.index] = network;
        const nodes = world.scapes[info.agents.get(spaceSpec.nodes)!.index]!;
        const initial = spaceSpec.initial;
        const settings = networkSettings[space.index]!;
        if (initial && initial.topology !== 'none') {
          sim.setup(() => {
            const members = nodes.members;
            if (initial.topology === 'ring') connectRing(network, members, settings.k);
            else if (initial.topology === 'random') {
              connectRandom(network, members, settings.probability, nodes.random);
            } else {
              connectSmallWorld(network, members, settings.k, settings.probability, nodes.random);
            }
          });
        }
      }

      this.#record(sim, world);
      this.#views(sim, world, types);

      if (stopWhen) {
        sim.observe({
          stepped: (current) => {
            if (stopWhen(world, current)) current.stop('stopWhen condition met');
          },
        });
      }
    };

    return {
      name: spec.name,
      ...(spec.description !== undefined ? { description: spec.description } : {}),
      parameters,
      build: build as (sim: Simulation<ParameterSchema>) => void,
    };
  }

  // ─────────────────────────────── Agent types ───────────────────────────

  #kind(agent: AgentInfo): AgentKind {
    const initials = (this.#initials[agent.index] = [] as (NumFn | undefined)[]);
    const attributes = agent.attributeList.map((attribute) => ({
      name: attribute.name,
      type: attribute.type,
    }));
    // Frames are laid out when first used, after `#type` has compiled the initial values.
    const root = (this.#initialRoots[agent.index] = new ScopeRoot('initial values', agent));
    const run = inFrame(root, (f) => {
      const values = f.self!.v;
      for (let i = 0; i < initials.length; i++) {
        const initial = initials[i];
        values[i] = initial ? initial(f) : 0;
      }
    });
    const kind: AgentKind = {
      index: agent.index,
      name: agent.name,
      attributes,
      synchronous: agent.spec.rules?.some((rule) => rule.synchronous === true) ?? false,
      init: (instance) => {
        run(instance);
        const world = instance.world;
        if (world.overrideKind === kind) {
          world.overrideKind = undefined;
          const slots = world.overrideSlots;
          for (let i = 0; i < slots.length; i++) instance.v[slots[i]!] = world.overrideValues[i]!;
        }
      },
    };
    return kind;
  }

  #type(agent: AgentInfo): CompiledType {
    const spec = agent.spec;
    const initialRoot = this.#initialRoots[agent.index]!;
    const initials = this.#initials[agent.index]!;
    for (const attribute of agent.attributeList) {
      const initial = attribute.spec.initial;
      initials.push(
        initial === undefined
          ? undefined
          : asNum(this.#expr(initial, new Scope(initialRoot), attribute.type)),
      );
    }

    const rules = (spec.rules ?? []).map((rule): CompiledRule => {
      const root = new ScopeRoot(`rule "${rule.name}"`, agent);
      const scope = new Scope(root);
      const synchronous = rule.synchronous === true;
      const when = rule.when === undefined ? undefined : asBool(this.#expr(rule.when, scope));
      const body = this.#actions(rule.do, scope, synchronous);
      return {
        name: rule.name,
        synchronous,
        execute: inFrame(root, when ? (f) => void (when(f) && body(f)) : body),
      };
    });

    let initialize: ((agent: SpecAgent) => void) | undefined;
    if (spec.initialize && spec.initialize.length > 0) {
      const root = new ScopeRoot('initialize', agent);
      initialize = inFrame(root, this.#actions(spec.initialize, new Scope(root), false));
    }

    const styleRoot = new ScopeRoot('style', agent, { noRandom: true });
    const style = spec.style;
    const color =
      style?.color === undefined
        ? undefined
        : inFrame(styleRoot, asNum(this.#expr(style.color, new Scope(styleRoot), COLOR)));
    const hidden =
      style?.hidden === undefined
        ? undefined
        : inFrame(styleRoot, asBool(this.#expr(style.hidden, new Scope(styleRoot), BOOLEAN)));

    const count =
      spec.count === undefined || agent.role === 'cell'
        ? undefined
        : asNum(
            this.#expr(
              spec.count,
              new Scope(new ScopeRoot('count', undefined, { constant: true })),
              INT,
            ),
          );
    return {
      info: agent,
      kind: this.#kinds[agent.index]!,
      count,
      rules,
      initialize,
      color,
      hidden,
    };
  }

  #scape(type: CompiledType, world: World, count: number): Scape<Agent> {
    const info = type.info;
    const spec = info.spec;
    const kind = type.kind;
    const base = {
      name: info.name,
      ...(spec.order !== undefined ? { order: spec.order } : {}),
      ...(spec.schedule !== undefined ? { schedule: spec.schedule } : {}),
    };
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError(
        `The count of "${info.name}" must be a non-negative integer, found ${count}`,
      );
    }
    const space = info.space;
    switch (info.role) {
      case 'cell': {
        const grid = space!.spec as Extract<SpaceInfo['spec'], { kind: 'grid' }>;
        const scape = new SpecGrid({
          ...base,
          width: world.widths[space!.index]!,
          height: world.heights[space!.index]!,
          wrap: grid.wrap ?? true,
          neighborhood: grid.neighborhood ?? 'moore',
          multiOccupancy: grid.multiOccupancy ?? false,
          create: () => new SpecCell(kind, world),
        });
        world.grids[space!.index] = scape;
        return scape as unknown as Scape<Agent>;
      }
      case 'occupant':
        return new OccupantScape(
          { ...base, size: count, create: () => new SpecOccupant(kind, world) },
          world,
          space!.index,
        ) as unknown as Scape<Agent>;
      case 'point': {
        const continuous = space!.spec as Extract<SpaceInfo['spec'], { kind: 'continuous' }>;
        const scape = new ContinuousScape<SpecPoint>({
          ...base,
          size: count,
          width: world.widths[space!.index]!,
          height: world.heights[space!.index]!,
          wrap: continuous.wrap ?? true,
          create: () => new SpecPoint(kind, world),
        });
        world.continuous[space!.index] ??= scape;
        return scape as unknown as Scape<Agent>;
      }
      case 'plain':
        return new Scape<SpecPlain>({
          ...base,
          size: count,
          create: () => new SpecPlain(kind, world),
        }) as unknown as Scape<Agent>;
    }
  }

  #stopWhen(e: Expression, root: ScopeRoot): (world: World, sim: Simulation) => boolean {
    const condition = asBool(this.#expr(e, new Scope(root), BOOLEAN));
    const pool = new FramePool(root);
    return (world, sim) => {
      const frame = pool.enter(undefined, world, sim.random);
      try {
        return condition(frame);
      } finally {
        pool.exit();
      }
    };
  }

  // ──────────────────────────────── Data and views ───────────────────────

  #record(sim: Simulation, world: World): void {
    for (const agent of this.#info.agentList) {
      const scape = world.scapes[agent.index]!;
      sim.data.count(scape, `${agent.name}.count`);
      for (const attribute of agent.attributeList) {
        const index = attribute.index;
        const spec = attribute.spec;
        const id = `${agent.name}.${attribute.name}`;
        if (spec.type === 'int' || spec.type === 'real') {
          const statistics = recordedStatistics(spec.record) as Statistic[];
          if (statistics.length > 0) {
            sim.data.measure(scape, id, (a) => (a as SpecAgent).v[index]!, { statistics });
          }
        } else if (spec.type === 'boolean') {
          if (spec.record === true) {
            sim.data.count(scape, id, (a) => (a as SpecAgent).v[index] !== 0);
          }
        } else if (spec.type === 'state' && spec.record === true) {
          spec.states.forEach((state, value) => {
            sim.data.count(scape, `${id}.${state}`, (a) => (a as SpecAgent).v[index] === value);
          });
        }
      }
    }
  }

  #views(sim: Simulation, world: World, types: readonly CompiledType[]): void {
    const colorOf = (type: CompiledType): ((agent: SpecAgent) => Color) => {
      const fixed = PALETTE[type.info.index % PALETTE.length]!;
      return type.color ?? (() => fixed);
    };
    for (const space of this.#info.spaceList) {
      const spec = space.spec;
      const title = spec.label ?? space.name;
      if (spec.kind === 'grid') {
        const cells = types[space.cellType!.index]!;
        const cellColor = cells.color ?? (() => DEFAULT_CELL_COLOR);
        const occupantColors = new Map(
          space.occupants.map((occupant) => {
            const type = types[occupant.index]!;
            const color = colorOf(type);
            const hidden = type.hidden;
            const show = hidden
              ? (agent: SpecAgent): Color | undefined => (hidden(agent) ? undefined : color(agent))
              : color;
            return [type.kind, show] as const;
          }),
        );
        const shape = space.occupants.map((o) => o.spec.style?.shape).find((s) => s);
        sim.addView(
          gridView<SpecCell, SpecOccupant>({
            title,
            grid: world.grids[space.index]!,
            cellColor: (cell) => cellColor(cell),
            occupantColor: (occupant) => occupantColors.get(occupant.kind)?.(occupant),
            ...(shape ? { occupantShape: shape } : {}),
          }),
        );
      } else if (spec.kind === 'continuous') {
        for (const point of space.points) {
          const type = types[point.index]!;
          const hidden = type.hidden;
          sim.addView(
            continuousView<SpecPoint>({
              title:
                space.points.length > 1 ? `${title}: ${point.spec.label ?? point.name}` : title,
              scape: world.scapes[point.index] as unknown as ContinuousScape<SpecPoint>,
              color: colorOf(type),
              ...(hidden ? { radius: (agent: SpecPoint) => (hidden(agent) ? 0 : 1) } : {}),
            }),
          );
        }
      } else {
        const nodes = this.#info.agents.get(spec.nodes)!;
        sim.addView(
          networkView<SpecAgent>({
            title,
            nodes: world.scapes[nodes.index] as unknown as Scape<SpecAgent>,
            network: world.networks[space.index] as unknown as Network<SpecAgent>,
            color: colorOf(types[nodes.index]!),
          }),
        );
      }
    }
    for (const chart of this.spec.charts ?? []) {
      sim.addView(
        chart.kind === 'timeSeries'
          ? timeSeriesView({ title: chart.title, series: chart.series })
          : barsView({ title: chart.title, series: chart.series }),
      );
    }
  }

  // ─────────────────────────────────── Actions ───────────────────────────

  #actions(list: readonly Action[] | undefined, scope: Scope, sync: boolean): Act {
    const inner = scope.child();
    const acts = (list ?? []).map((action) => this.#action(action, inner, sync));
    if (acts.length === 0) return () => {};
    if (acts.length === 1) return acts[0]!;
    return (f) => {
      for (let i = 0; i < acts.length; i++) {
        acts[i]!(f);
        if (!f.self!.alive) return;
      }
    };
  }

  #action(action: Action, scope: Scope, sync: boolean): Act {
    const self = scope.root.self!;
    if ('to' in action) return this.#set(action.set, action.to, scope, sync);
    if ('let' in action) {
      const code = this.#expr(action.value, scope);
      const variable = scope.declare(action.let, code.type);
      const slot = variable.slot;
      if (code.kind === 'ref') {
        const value = code.fn;
        return (f) => {
          f.refs[slot] = value(f);
        };
      }
      const value = asNum(code);
      return (f) => {
        f.nums[slot] = value(f);
      };
    }
    if ('if' in action) {
      const condition = asBool(this.#expr(action.if, scope, BOOLEAN));
      const then = this.#actions(action.then, scope, sync);
      const otherwise = action.else ? this.#actions(action.else, scope, sync) : undefined;
      return otherwise
        ? (f) => (condition(f) ? then(f) : otherwise(f))
        : (f) => {
            if (condition(f)) then(f);
          };
    }
    if ('with' in action) {
      const { selection, choose } = this.#choice(action.with, scope, false);
      const slot = selection.slot;
      const body = this.#actions(action.do, selection.scope, sync);
      const otherwise = action.else ? this.#actions(action.else, scope, sync) : undefined;
      return (f) => {
        const found = choose(f);
        if (found) {
          f.refs[slot] = found;
          body(f);
        } else {
          otherwise?.(f);
        }
      };
    }
    if ('forEach' in action) {
      const selection = this.#selection(action.forEach, scope, false);
      const slot = selection.slot;
      const each = selection.each;
      const body = this.#actions(action.do, selection.scope, sync);
      let collecting: SpecAgent[] = [];
      const collect: Visit = (f) => {
        collecting.push(f.refs[slot]!);
        return false;
      };
      return (f) => {
        const found: SpecAgent[] = [];
        collecting = found;
        each(f, collect);
        for (let i = 0; i < found.length; i++) {
          const agent = found[i]!;
          if (!agent.alive) continue;
          f.refs[slot] = agent;
          body(f);
          if (!f.self!.alive) return;
        }
      };
    }
    if ('moveTo' in action) {
      const grid = self.space!;
      const toCell = this.#info.agents.get(action.moveTo.type) === grid.cellType;
      const multi = grid.spec.kind === 'grid' && grid.spec.multiOccupancy === true;
      const { choose } = this.#choice(action.moveTo, scope, toCell && !multi);
      return toCell
        ? (f) => {
            const cell = choose(f) as SpecCell | undefined;
            if (cell) (f.self as SpecOccupant).moveTo(cell);
          }
        : (f) => {
            const cell = (choose(f) as SpecOccupant | undefined)?.cell;
            if (cell) (f.self as SpecOccupant).moveTo(cell);
          };
    }
    if ('moveBy' in action) {
      const dx = asNum(this.#expr(action.moveBy.dx, scope, REAL));
      const dy = asNum(this.#expr(action.moveBy.dy, scope, REAL));
      return (f) => (f.self as SpecPoint).moveBy(dx(f), dy(f));
    }
    if ('moveToward' in action) {
      const target = asRef(this.#reference(action.moveToward, scope));
      const distance = asNum(this.#expr(action.distance, scope, REAL));
      const index = self.index;
      return (f) => {
        const other = target(f) as SpecPoint | undefined;
        if (!other || !other.alive) return;
        const d = distance(f);
        const scape = f.world.scapes[index] as unknown as ContinuousScape<SpecPoint>;
        const agent = f.self as SpecPoint;
        if (d >= 0) scape.moveToward(agent, other, d);
        else scape.moveAway(agent, other, -d);
      };
    }
    if ('die' in action) {
      if (action.die === true) return (f) => f.self!.die();
      const target = asRef(this.#reference(action.die, scope));
      return (f) => target(f)?.die();
    }
    if ('create' in action) return this.#create(action, self, scope);
    if ('connect' in action || 'disconnect' in action) {
      const connect = 'connect' in action;
      const other = asRef(this.#reference(connect ? action.connect : action.disconnect, scope));
      const index = this.#info.spaces.get(action.network)!.index;
      return connect
        ? (f) => {
            const agent = other(f);
            if (agent) f.world.networks[index]!.connect(f.self!, agent);
          }
        : (f) => {
            const agent = other(f);
            if (agent) f.world.networks[index]!.disconnect(f.self!, agent);
          };
    }
    if ('stop' in action) {
      const reason = action.stop;
      return (f) => f.world.sim.stop(reason);
    }
    throw new Error(`Internal error: unknown action ${actionKind(action)}`);
  }

  #set(target: string, value: Expression, scope: Scope, sync: boolean): Act {
    const resolution = resolveReference(this.#info, target, scope);
    if (!resolution.ok || resolution.value.kind !== 'path') {
      throw new Error(`Internal error: cannot set "${target}"`);
    }
    const resolved = resolution.value;
    const last = resolved.steps.at(-1);
    if (last?.kind !== 'attribute') throw new Error(`Internal error: cannot set "${target}"`);
    const slot = last.attribute.index;
    const compute = asNum(this.#expr(value, scope, last.attribute.type));
    if (sync) {
      return (f) => {
        const agent = f.self!;
        agent.next![slot] = compute(f);
        agent.dirty![slot] = 1;
        agent.changed = true;
      };
    }
    if (resolved.base === 'self' && resolved.steps.length === 1) {
      return (f) => {
        f.self!.v[slot] = compute(f);
      };
    }
    const owner = this.#agentPath(resolved.base, resolved.steps.slice(0, -1).length);
    return (f) => {
      const result = compute(f);
      const agent = owner(f);
      if (agent) agent.v[slot] = result;
    };
  }

  #create(action: Extract<Action, { create: string }>, self: AgentInfo, scope: Scope): Act {
    const type = this.#info.agents.get(action.create)!;
    const kind = this.#kinds[type.index]!;
    const count =
      action.count === undefined ? undefined : asNum(this.#expr(action.count, scope, INT));
    const overrides = Object.entries(action.set ?? {}).map(([key, e]) => {
      const attribute = type.attributes.get(key)!;
      return { slot: attribute.index, value: asNum(this.#expr(e, scope, attribute.type)) };
    });
    const slots = overrides.map((override) => override.slot);
    const values = new Float64Array(overrides.length);
    const at = action.at ?? 'random';
    const typeIndex = type.index;
    const space = type.space;
    const creatorIsCell = self.role === 'cell';

    let make: (f: Frame) => SpecAgent | undefined;
    if (type.role === 'occupant') {
      const gridIndex = space!.index;
      make = (f) => {
        const grid = f.world.grids[gridIndex]!;
        let cell: SpecCell | undefined;
        if (at === 'random') {
          cell = randomFreeCell(grid, f.random);
        } else {
          const creator = f.self!;
          const own = creatorIsCell ? (creator as SpecCell) : (creator as SpecOccupant).cell;
          if (!own) return undefined;
          if (at === 'here') {
            cell = grid.multiOccupancy || own.isAvailable ? own : undefined;
          } else {
            cell = randomNeighbor(own, grid.multiOccupancy, f.random);
          }
        }
        if (!cell) return undefined;
        f.world.pendingCell = cell;
        return new SpecOccupant(kind, f.world);
      };
    } else if (type.role === 'point') {
      const spaceIndex = space!.index;
      make = (f) => {
        if (at === 'here') {
          const creator = f.self as SpecPoint;
          return new SpecPoint(kind, f.world, creator.x, creator.y);
        }
        const world = f.world;
        return new SpecPoint(
          kind,
          world,
          f.random.float() * world.widths[spaceIndex]!,
          f.random.float() * world.heights[spaceIndex]!,
        );
      };
    } else {
      make = (f) => new SpecPlain(kind, f.world);
    }

    const createOne = (f: Frame): boolean => {
      for (let i = 0; i < overrides.length; i++) values[i] = overrides[i]!.value(f);
      const agent = make(f);
      if (!agent) return false;
      const world = f.world;
      world.overrideKind = overrides.length > 0 ? kind : undefined;
      world.overrideSlots = slots;
      world.overrideValues = values;
      try {
        world.scapes[typeIndex]!.add(agent);
      } finally {
        world.overrideKind = undefined;
        world.pendingCell = undefined;
      }
      return true;
    };
    return count
      ? (f) => {
          const n = count(f);
          for (let i = 0; i < n; i++) if (!createOne(f)) break;
        }
      : (f) => void createOne(f);
  }

  // ───────────────────────────────── Selections ──────────────────────────

  #selection(selection: Selection, scope: Scope, freeCellsOnly: boolean): CompiledSelection {
    const info = this.#info;
    const target = info.agents.get(selection.type)!;
    const targetKind = this.#kinds[target.index]!;
    let origin: RefFn | undefined;
    let originInfo: AgentInfo | undefined;
    if (selection.of !== undefined) {
      const code = this.#reference(selection.of, scope);
      origin = asRef(code);
      originInfo = code.type.kind === 'agent' ? info.agents.get(code.type.agent) : undefined;
    } else if (scope.root.self) {
      origin = (f) => f.self;
      originInfo = scope.root.self;
    }
    const radius =
      selection.from === 'within' && selection.radius !== undefined
        ? asNum(this.#expr(selection.radius, scope, REAL))
        : undefined;
    const inner = scope.child();
    const slot = inner.declare(selection.as ?? 'other', agentType(target.name)).slot;
    const where =
      selection.where === undefined
        ? undefined
        : asBool(this.#expr(selection.where, inner, BOOLEAN));

    const consider = (f: Frame, agent: SpecAgent, visit: Visit): boolean => {
      f.refs[slot] = agent;
      if (freeCellsOnly && !(agent as SpecCell).isAvailable) return false;
      if (where !== undefined && !where(f)) return false;
      return visit(f);
    };
    const targetIndex = target.index;
    const targetIsCell = target.role === 'cell';
    const originIsCell = originInfo?.role === 'cell';
    const originCell = (o: SpecAgent | undefined): SpecCell | undefined => {
      if (!o || !o.alive) return undefined;
      return originIsCell ? (o as SpecCell) : (o as SpecOccupant).cell;
    };
    /** Visits the occupants of the target type on a cell, other than the origin. */
    const occupantsOf = (f: Frame, cell: SpecCell, o: SpecAgent, visit: Visit): boolean => {
      const occupants = cell.occupants;
      for (let j = 0; j < occupants.length; j++) {
        const agent = occupants[j] as SpecOccupant;
        if (agent.kind !== targetKind || agent === o) continue;
        if (consider(f, agent, visit)) return true;
      }
      return false;
    };

    let each: Each;
    switch (selection.from) {
      case 'all':
        each = (f, visit) => {
          const o = origin?.(f);
          const members = f.world.scapes[targetIndex]!.members as readonly SpecAgent[];
          for (let i = 0; i < members.length; i++) {
            const agent = members[i]!;
            if (agent === o || !agent.alive) continue;
            if (consider(f, agent, visit)) return;
          }
        };
        break;
      case 'neighbors': {
        const gridIndex = gridOf(originInfo!)!.index;
        each = (f, visit) => {
          const o = origin!(f);
          const cell = originCell(o);
          if (!cell) return;
          const neighbors = f.world.grids[gridIndex]!.neighbors(cell);
          for (let i = 0; i < neighbors.length; i++) {
            const neighbor = neighbors[i]!;
            if (targetIsCell) {
              if (consider(f, neighbor, visit)) return;
            } else if (occupantsOf(f, neighbor, o!, visit)) {
              return;
            }
          }
        };
        break;
      }
      case 'here':
        each = (f, visit) => {
          const o = origin!(f);
          const cell = originCell(o);
          if (!cell) return;
          if (targetIsCell) {
            if (cell !== o) consider(f, cell, visit);
          } else {
            occupantsOf(f, cell, o!, visit);
          }
        };
        break;
      case 'within': {
        const space = originInfo!.space!;
        if (space.spec.kind === 'grid') {
          const gridIndex = space.index;
          each = (f, visit) => {
            const o = origin!(f);
            const cell = originCell(o);
            if (!cell) return;
            const cells = f.world.grids[gridIndex]!.within(cell, radius!(f), WITH_ORIGIN);
            for (let i = 0; i < cells.length; i++) {
              const found = cells[i]!;
              if (targetIsCell) {
                if (found !== o && consider(f, found, visit)) return;
              } else if (occupantsOf(f, found, o!, visit)) {
                return;
              }
            }
          };
        } else {
          each = (f, visit) => {
            const o = origin!(f) as SpecPoint | undefined;
            if (!o || !o.alive) return;
            const scape = f.world.scapes[targetIndex] as unknown as ContinuousScape<SpecPoint>;
            const found = scape.within(o, radius!(f));
            for (let i = 0; i < found.length; i++) {
              if (consider(f, found[i]!, visit)) return;
            }
          };
        }
        break;
      }
      case 'linked': {
        const networkIndex = info.spaces.get(selection.network!)!.index;
        each = (f, visit) => {
          const o = origin!(f);
          if (!o || !o.alive) return;
          const linked = f.world.networks[networkIndex]!.neighbors(o) as readonly SpecAgent[];
          for (let i = 0; i < linked.length; i++) {
            const agent = linked[i]!;
            if (agent.alive && consider(f, agent, visit)) return;
          }
        };
        break;
      }
    }
    return { target, scope: inner, slot, origin, originInfo, each };
  }

  #choice(
    choice: Choice,
    scope: Scope,
    freeCellsOnly: boolean,
  ): { selection: CompiledSelection; choose: RefFn } {
    const selection = this.#selection(choice, scope, freeCellsOnly);
    const { slot, each } = selection;
    const pick = choice.pick ?? 'random';

    if (pick === 'random') {
      const buffer: SpecAgent[] = [];
      const collect: Visit = (f) => {
        buffer.push(f.refs[slot]!);
        return false;
      };
      return {
        selection,
        choose: (f) => {
          each(f, collect);
          const n = buffer.length;
          if (n === 0) return undefined;
          const chosen = buffer[n === 1 ? 0 : f.random.int(0, n)];
          buffer.length = 0;
          return chosen;
        },
      };
    }

    // The best by a score, ties broken uniformly at random (reservoir sampling).
    let best: SpecAgent | undefined;
    let bestScore = 0;
    let ties = 0;
    let score: NumFn;
    let sign = 1;
    let start: (f: Frame) => void = () => {};
    if (pick === 'nearest') {
      const distance = this.#distanceFn(selection.originInfo!, selection.target);
      let from: SpecAgent | undefined;
      start = (f) => {
        from = selection.origin!(f);
      };
      score = (f) => distance(f.world, from!, f.refs[slot]!);
      sign = -1;
    } else if ('max' in pick) {
      score = asNum(this.#expr(pick.max, selection.scope, REAL));
    } else {
      score = asNum(this.#expr(pick.min, selection.scope, REAL));
      sign = -1;
    }
    const visit: Visit = (f) => {
      const value = score(f) * sign;
      if (ties === 0 || value > bestScore) {
        best = f.refs[slot];
        bestScore = value;
        ties = 1;
      } else if (value === bestScore) {
        ties++;
        if (f.random.int(0, ties) === 0) best = f.refs[slot];
      }
      return false;
    };
    return {
      selection,
      choose: (f) => {
        best = undefined;
        ties = 0;
        start(f);
        each(f, visit);
        const chosen = best;
        best = undefined;
        return chosen;
      },
    };
  }

  /** Distance between agents of two types sharing a grid or continuous space. */
  #distanceFn(a: AgentInfo, b: AgentInfo): (world: World, x: SpecAgent, y: SpecAgent) => number {
    const space = a.space!;
    const index = space.index;
    if (space.spec.kind === 'grid') {
      const cellOf = (role: AgentInfo['role']) =>
        role === 'cell'
          ? (agent: SpecAgent) => agent as SpecCell
          : (agent: SpecAgent) => (agent as SpecOccupant).cell!;
      const cellA = cellOf(a.role);
      const cellB = cellOf(b.role);
      return (world, x, y) => world.grids[index]!.distance(cellA(x), cellB(y));
    }
    return (world, x, y) => world.continuous[index]!.distance(x as SpecPoint, y as SpecPoint);
  }

  // ───────────────────────────────── Expressions ─────────────────────────

  #expr(e: Expression, scope: Scope, expected?: Type): Code {
    if (typeof e === 'number') return numCode(Number.isInteger(e) ? INT : REAL, () => e);
    if (typeof e === 'boolean') return boolCode(() => e);
    if (typeof e === 'string') return this.#reference(e, scope);
    if ('state' in e) {
      if (expected?.kind !== 'state') throw new Error(`Internal error: state "${e.state}"`);
      const value = expected.states.indexOf(e.state);
      return numCode(expected, () => value);
    }
    if ('color' in e) {
      const value = Number.parseInt(e.color.slice(1), 16);
      return numCode(COLOR, () => value);
    }
    if ('op' in e) return this.#operation(e.op, e.args, scope, expected);
    return this.#aggregate(e.aggregate, e.over, e.of, scope);
  }

  #reference(reference: string, scope: Scope): Code {
    const resolution = resolveReference(this.#info, reference, scope);
    if (!resolution.ok) throw new Error(`Internal error: ${resolution.message}`);
    const resolved = resolution.value;
    switch (resolved.kind) {
      case 'tick':
        return numCode(INT, (f) => f.world.sim.tick);
      case 'param': {
        const index = resolved.parameter.index;
        return resolved.type.kind === 'boolean'
          ? boolCode((f) => f.world.params[index] !== 0)
          : numCode(resolved.type, (f) => f.world.params[index]!);
      }
      case 'spaceSize': {
        const index = resolved.space.index;
        return resolved.dimension === 'width'
          ? numCode(resolved.type, (f) => f.world.widths[index]!)
          : numCode(resolved.type, (f) => f.world.heights[index]!);
      }
      case 'local': {
        const slot = resolved.variable.slot;
        return resolved.type.kind === 'boolean'
          ? boolCode((f) => f.nums[slot] !== 0)
          : numCode(resolved.type, (f) => f.nums[slot]!);
      }
      case 'path': {
        const steps = resolved.steps;
        const last = steps.at(-1);
        if (!last || last.kind === 'cell') {
          return refCode(resolved.type, this.#agentPath(resolved.base, steps.length));
        }
        const owner = this.#agentPath(resolved.base, steps.length - 1);
        const direct = steps.length === 1;
        const base = resolved.base;
        switch (last.kind) {
          case 'attribute': {
            const index = last.attribute.index;
            if (resolved.type.kind === 'boolean') {
              if (direct && base === 'self') return boolCode((f) => f.self!.v[index] !== 0);
              if (direct && base !== 'self') {
                const slot = base.slot;
                return boolCode((f) => f.refs[slot]!.v[index] !== 0);
              }
              return boolCode((f) => owner(f)!.v[index] !== 0);
            }
            if (direct && base === 'self') return numCode(resolved.type, (f) => f.self!.v[index]!);
            if (direct && base !== 'self') {
              const slot = base.slot;
              return numCode(resolved.type, (f) => f.refs[slot]!.v[index]!);
            }
            return numCode(resolved.type, (f) => owner(f)!.v[index]!);
          }
          case 'x':
            return numCode(resolved.type, (f) => (owner(f) as SpecCell | SpecPoint).x);
          case 'y':
            return numCode(resolved.type, (f) => (owner(f) as SpecCell | SpecPoint).y);
          case 'id':
            return numCode(resolved.type, (f) => owner(f)!.id);
        }
      }
    }
  }

  /** The agent reached from a base by `cellSteps` `.cell` steps. */
  #agentPath(base: 'self' | { readonly slot: number }, cellSteps: number): RefFn {
    let fn: RefFn;
    if (base === 'self') {
      fn = (f) => f.self;
    } else {
      const slot = base.slot;
      fn = (f) => f.refs[slot];
    }
    for (let i = 0; i < cellSteps; i++) {
      const previous = fn;
      fn = (f) => (previous(f) as SpecOccupant | undefined)?.cell;
    }
    return fn;
  }

  #operation(
    op: Operator,
    args: readonly Expression[],
    scope: Scope,
    expected: Type | undefined,
  ): Code {
    const signature = OPERATORS[op];

    if (op === 'eq' || op === 'ne') {
      const [a, b] = args as [Expression, Expression];
      let left: Code;
      let right: Code;
      if (isStateLiteral(a) && !isStateLiteral(b)) {
        right = this.#expr(b, scope);
        left = this.#expr(a, scope, right.type);
      } else {
        left = this.#expr(a, scope);
        right = this.#expr(b, scope, left.type);
      }
      const equal = equality(left, right);
      return boolCode(op === 'eq' ? equal : (f) => !equal(f));
    }

    if (op === 'if') {
      const [c, t, e] = args as [Expression, Expression, Expression];
      const condition = asBool(this.#expr(c, scope, BOOLEAN));
      let then: Code;
      let otherwise: Code;
      if (isStateLiteral(t) && !isStateLiteral(e)) {
        otherwise = this.#expr(e, scope, expected);
        then = this.#expr(t, scope, otherwise.type);
      } else {
        then = this.#expr(t, scope, expected);
        otherwise = this.#expr(e, scope, then.type);
      }
      const type = operatorResult('if', [BOOLEAN, then.type, otherwise.type]);
      if (then.kind === 'bool' && otherwise.kind === 'bool') {
        const a = then.fn;
        const b = otherwise.fn;
        return boolCode((f) => (condition(f) ? a(f) : b(f)));
      }
      if (then.kind === 'ref' && otherwise.kind === 'ref') {
        const a = then.fn;
        const b = otherwise.fn;
        return refCode(type, (f) => (condition(f) ? a(f) : b(f)));
      }
      const a = asNum(then);
      const b = asNum(otherwise);
      return numCode(type, (f) => (condition(f) ? a(f) : b(f)));
    }

    if (op === 'and' || op === 'or' || op === 'not') {
      const parts = args.map((arg) => asBool(this.#expr(arg, scope, BOOLEAN)));
      if (op === 'not') {
        const a = parts[0]!;
        return boolCode((f) => !a(f));
      }
      return boolCode(
        parts.reduce((left, right) =>
          op === 'and' ? (f) => left(f) && right(f) : (f) => left(f) || right(f),
        ),
      );
    }

    if (op === 'distance') {
      const [a, b] = args.map((arg) => this.#expr(arg, scope));
      const agentA = this.#info.agents.get((a!.type as { agent: string }).agent)!;
      const agentB = this.#info.agents.get((b!.type as { agent: string }).agent)!;
      const distance = this.#distanceFn(agentA, agentB);
      const left = asRef(a!);
      const right = asRef(b!);
      return numCode(REAL, (f) => distance(f.world, left(f)!, right(f)!));
    }

    const codes = args.map((arg) => this.#expr(arg, scope));
    const type = operatorResult(
      op,
      codes.map((code) => code.type),
    );
    const fns = codes.map(asNum);
    if (signature.test) {
      const test = signature.test;
      const [a, b] = fns;
      if (fns.length === 1) return boolCode((f) => test(a!(f), 0, 0, f.random));
      return boolCode((f) => test(a!(f), b!(f), 0, f.random));
    }
    const apply = signature.number!;
    switch (fns.length) {
      case 0:
        return numCode(type, (f) => apply(0, 0, 0, f.random));
      case 1: {
        const a = fns[0]!;
        return numCode(type, (f) => apply(a(f), 0, 0, f.random));
      }
      case 3: {
        const [a, b, c] = fns as [NumFn, NumFn, NumFn];
        if (!signature.variadic) {
          return numCode(type, (f) => apply(a(f), b(f), c(f), f.random));
        }
        break;
      }
    }
    // Two arguments, or a variadic operator applied pairwise from the left.
    const folded = fns.reduce((left, right) => (f) => apply(left(f), right(f), 0, f.random));
    return numCode(type, folded);
  }

  #aggregate(
    aggregate: AggregateKind,
    over: Selection,
    of: Expression | undefined,
    scope: Scope,
  ): Code {
    const selection = this.#selection(over, scope, false);
    const each = selection.each;
    switch (aggregate) {
      case 'count': {
        let n = 0;
        const test = of === undefined ? undefined : asBool(this.#expr(of, selection.scope));
        const visit: Visit = test
          ? (f) => {
              if (test(f)) n++;
              return false;
            }
          : () => {
              n++;
              return false;
            };
        return numCode(INT, (f) => {
          n = 0;
          each(f, visit);
          return n;
        });
      }
      case 'any': {
        let found = false;
        const test = of === undefined ? undefined : asBool(this.#expr(of, selection.scope));
        const visit: Visit = (f) => (test === undefined || test(f) ? (found = true) : false);
        return boolCode((f) => {
          found = false;
          each(f, visit);
          return found;
        });
      }
      case 'all': {
        if (of === undefined) return boolCode(() => true);
        let holds = true;
        const test = asBool(this.#expr(of, selection.scope));
        const visit: Visit = (f) => (test(f) ? false : !(holds = false));
        return boolCode((f) => {
          holds = true;
          each(f, visit);
          return holds;
        });
      }
      default: {
        const code = this.#expr(of!, selection.scope);
        const value = asNum(code);
        let total = 0;
        let n = 0;
        let visit: Visit;
        if (aggregate === 'min' || aggregate === 'max') {
          const max = aggregate === 'max';
          visit = (f) => {
            const x = value(f);
            if (n === 0 || (max ? x > total : x < total)) total = x;
            n++;
            return false;
          };
        } else {
          visit = (f) => {
            total += value(f);
            n++;
            return false;
          };
        }
        const mean = aggregate === 'mean';
        return numCode(aggregate === 'mean' ? REAL : code.type, (f) => {
          total = 0;
          n = 0;
          each(f, visit);
          return mean ? (n === 0 ? 0 : total / n) : total;
        });
      }
    }
  }
}

/** Compares two compiled values of comparable types. */
function equality(left: Code, right: Code): BoolFn {
  if (left.kind === 'ref' && right.kind === 'ref') {
    const a = left.fn;
    const b = right.fn;
    return (f) => a(f) === b(f);
  }
  if (left.kind === 'bool' && right.kind === 'bool') {
    const a = left.fn;
    const b = right.fn;
    return (f) => a(f) === b(f);
  }
  const a = asNum(left);
  const b = asNum(right);
  return (f) => a(f) === b(f);
}

/** A random neighbouring cell that is free (any neighbour with multi-occupancy). */
function randomNeighbor(
  cell: SpecCell,
  multiOccupancy: boolean,
  random: Frame['random'],
): SpecCell | undefined {
  const neighbors = cell.neighbors;
  let count = 0;
  for (let i = 0; i < neighbors.length; i++) {
    if (multiOccupancy || neighbors[i]!.isAvailable) count++;
  }
  if (count === 0) return undefined;
  let remaining = random.int(0, count);
  for (let i = 0; i < neighbors.length; i++) {
    const neighbor = neighbors[i]!;
    if ((multiOccupancy || neighbor.isAvailable) && remaining-- === 0) return neighbor;
  }
  return undefined;
}

function toEngineParameters(spec: Record<string, ParameterSpec>): ParameterSchema {
  const result: Record<string, Parameter> = {};
  for (const [name, parameter] of Object.entries(spec)) {
    const extra = {
      ...(parameter.label !== undefined ? { label: parameter.label } : {}),
      ...(parameter.description !== undefined ? { description: parameter.description } : {}),
    };
    switch (parameter.type) {
      case 'int':
      case 'real':
        result[name] = {
          type: parameter.type,
          default: parameter.default,
          ...(parameter.min !== undefined ? { min: parameter.min } : {}),
          ...(parameter.max !== undefined ? { max: parameter.max } : {}),
          ...extra,
        };
        break;
      case 'boolean':
        result[name] = { type: 'boolean', default: parameter.default, ...extra };
        break;
      case 'choice':
        result[name] = {
          type: 'choice',
          options: parameter.options,
          default: parameter.default,
          ...extra,
        };
        break;
      case 'text':
        result[name] = { type: 'text', default: parameter.default, ...extra };
        break;
    }
  }
  return result;
}
