// SPDX-License-Identifier: EPL-2.0
//
// The interpreter for the Metascape model format (derived from the MetaABM
// metamodel; see ./types.ts). A checked model compiles once into closures
// over the engine and becomes an ordinary engine model, which runs in Studio,
// in a Runner and in experiments like any other.
import {
  Array2DMoore,
  Array2DVonNeumann,
  colors,
  Continuous2D,
  continuousView,
  Graph,
  gridView,
  ListSpace,
  networkView,
  Scape,
  stat,
  timeSeriesView,
  type Agent,
  type Cell,
  type Color,
  type Model as EngineModel,
  type Parameter,
  type ParameterSchema,
  type RootScape,
  type Rule,
  type Space,
} from '@metascape/engine';
import type { Curation } from '../curation/types';
import { assertNoErrors, checkCuration, checkRunSpec } from '../runspec/check';
import { agentAt, measuredAttributes, measurementLabel, seriesOf } from '../runspec/measure';
import {
  lookupIn,
  resolveRunSpec,
  runSetups,
  runsOf,
  stopConditions,
  type RunSpecLookup,
} from '../runspec/runs';
import type { RunSpec } from '../runspec/types';
import { assertValidModel } from './check';
import { coreLibrary } from './core-library';
import { Behaviour, holderFor, indexFunctions, type FunctionEntry } from './flows';
import { coreFunctions, type Datum, type FunctionImplementation, type Mark } from './functions';
import {
  actsOf,
  indexModel,
  MethodCodeError,
  UnsupportedModelError,
  type AgentInfo,
  type AttributeInfo,
  type ModelIndex,
  type ScapeInfo,
  type SpaceInfo,
} from './model-index';
import { compileMethodBody, type MethodImplementation, type MethodImplementations } from './method';
import {
  ContinuousInstance,
  enclosing,
  GridInstance,
  InterpAgent,
  InterpCell,
  InterpScape,
  isHolder,
  NetworkInstance,
  RunState,
  type Behaviours,
  type Holder,
  type SpaceInstance,
} from './runtime';
import type { AttributeRef, Constant, Library, Model } from './types';

export interface CompileOptions {
  /** The function library sinks refer to. Default: the core library. */
  readonly library?: Library;
  /** Implementations of the library's functions, by ID, in addition to (or in place of) the core ones. */
  readonly functions?: Readonly<Record<string, FunctionImplementation>>;
  /**
   * What to look at (R24): its measures and the series of its charts are
   * recorded whether or not the model gathers them, and its charts are views
   * of the model.
   */
  readonly curation?: Curation;
  /**
   * The model's run specs (R24), offered as its runs (`runs` of the engine
   * model), one per run of each. What they stop on is recorded.
   */
  readonly runSpecs?: readonly RunSpec[];
  /**
   * The run spec the model runs by when no other is chosen (R24): its values
   * become the parameters' defaults, and its stop period and stop conditions
   * the model's. It must describe one run, not a sweep.
   */
  readonly runSpec?: RunSpec;
  /** Finds run specs the given ones incorporate. Default: among `runSpecs` and `runSpec`. */
  readonly runSpecLookup?: RunSpecLookup;
  /**
   * Implementations of the model's method acts (R21), by agent path and act
   * path. One given for an act that is not a method of the model is an error.
   */
  readonly methods?: MethodImplementations;
  /**
   * Evaluates method bodies held as text in the model. Off by default: a body
   * is code from the model file, which could do anything the page can, so a
   * model with a body (and no implementation given for it) does not compile
   * unless this is set. Set it only for models from a source you trust.
   */
  readonly allowMethodBodies?: boolean;
}

/** Default colours of agents without a style, by agent type. */
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

const num = (value: Datum): number =>
  typeof value === 'number' ? value : typeof value === 'boolean' ? (value ? 1 : 0) : Number(value);

/**
 * Compiles a model into an ordinary engine model. Checks it first, and throws
 * an {@link UnsupportedModelError} for what the interpreter does not run yet.
 *
 * Mapping: the root scape's attributes, and the attributes of its spaces
 * (written `space.attribute`), become the model's parameters. The root
 * scape's own rules run on a scape of their own with the root scape as its one
 * member, first among the root's scapes. Each grid is a scape of cells; each
 * network a scape whose members are the agents it links; each other agent type
 * a scape of its own (with a continuous space if its agents are in one), in
 * the order declared. A nested scape is a member of its type's scape and holds
 * its own spaces and populations. Rules, initialize acts and diffuse acts
 * become the rules and initial rules of those scapes, so that their order and
 * execution can be changed while the model runs (R14).
 */
export function compileModel(model: Model, options: CompileOptions = {}): EngineModel {
  const library = options.library ?? coreLibrary;
  assertValidModel(model, library);
  const { curation, runSpec } = options;
  const specs = options.runSpecs ?? [];
  const all = runSpec ? [...specs, runSpec] : specs;
  const lookup = options.runSpecLookup ?? lookupIn(all);
  if (curation) assertNoErrors(checkCuration(curation, model));
  for (const spec of all) assertNoErrors(checkRunSpec(spec, model, lookup));
  const own = runSpec && runsOf(runSpec, lookup);
  if (runSpec && own?.length !== 1) {
    throw new Error(`The run spec ${runSpec.id} describes ${own?.length} runs, not one`);
  }
  const run = own?.[0];
  const recorded = measuredAttributes([
    ...(curation?.measures ?? []),
    ...(curation?.charts ?? []).flatMap((chart) => chart.series),
    ...specs.flatMap((spec) => resolveRunSpec(spec, lookup).stopWhen),
    ...(run?.stopWhen ?? []),
  ]);
  const charts = curation?.charts ?? [];
  const runs = runSetups(model, specs, lookup);
  const compiled = compileChecked(
    recorded.length > 0 ? gathering(model, recorded) : model,
    options,
  );
  return {
    ...compiled,
    ...(run && {
      parameters: Object.fromEntries(
        Object.entries(compiled.parameters).map(([name, parameter]) => [
          name,
          name in run.parameters ? { ...parameter, default: run.parameters[name] } : parameter,
        ]),
      ) as ParameterSchema,
      ...(run.stopPeriod !== undefined && { stopPeriod: run.stopPeriod }),
      ...(run.stopWhen.length > 0 && { stopWhen: stopConditions(model, run.stopWhen) }),
    }),
    ...(runs.length > 0 && { runs }),
    ...(charts.length > 0 && {
      views: () =>
        charts.map((chart) => {
          const ids = chart.series.map((m) => {
            const series = seriesOf(model, m);
            return series && 'id' in series ? series.id : '';
          });
          return timeSeriesView({
            title: chart.title,
            series: ids,
            labels: Object.fromEntries(
              chart.series.map((m, i) => [ids[i]!, m.label ?? measurementLabel(model, m)]),
            ),
            ...(chart.yMin !== undefined && { yMin: chart.yMin }),
            ...(chart.yMax !== undefined && { yMax: chart.yMax }),
            ...(chart.yLabel !== undefined && { yLabel: chart.yLabel }),
          });
        }),
    }),
  };
}

/** A copy of a model that gathers data on the given attributes too. */
function gathering(model: Model, refs: readonly AttributeRef[]): Model {
  const copy = JSON.parse(JSON.stringify(model)) as Model;
  for (const ref of refs) {
    const dot = ref.lastIndexOf('.');
    const attribute = agentAt(copy, ref.slice(0, dot))?.attributes?.[ref.slice(dot + 1)];
    if (attribute) attribute.gatherData = true;
  }
  return copy;
}

function compileChecked(model: Model, options: CompileOptions): EngineModel {
  const library = options.library ?? coreLibrary;
  const index = indexModel(model);
  const functions = indexFunctions(library, { ...coreFunctions, ...options.functions });
  compileBehaviours(
    index,
    functions,
    indexConstants(library),
    methodsOf(index, options.methods ?? {}, options.allowMethodBodies ?? false),
  );
  const keepsOriginals = actsUse(index, 'original');
  const parameters = engineParameters(index);
  return {
    name: model.label ?? model.id,
    ...(model.description !== undefined ? { description: model.description } : {}),
    parameters,
    build: (root) => new World(index, root as RootScape, keepsOriginals).build(),
  };
}

/** The constants of a library and its sub-libraries, by ID. */
function indexConstants(library: Library): Map<string, Constant> {
  const found = new Map<string, Constant>();
  const visit = (lib: Library) => {
    for (const [id, constant] of Object.entries(lib.constants ?? {})) found.set(id, constant);
    for (const sub of Object.values(lib.subs ?? {})) visit(sub);
  };
  visit(library);
  return found;
}

/**
 * The implementation of each method act of each agent (R21): the one given,
 * else its body if bodies are allowed. Throws a {@link MethodCodeError} naming
 * every method with a body that may not run, and every provided method with
 * no implementation; and an error for an implementation of no method.
 */
function methodsOf(
  index: ModelIndex,
  given: MethodImplementations,
  allowBodies: boolean,
): Map<AgentInfo, Map<string, MethodImplementation>> {
  const found = new Map<AgentInfo, Map<string, MethodImplementation>>();
  const bodies: string[] = [];
  const missing: string[] = [];
  const unknown: string[] = [];
  const name = (agent: AgentInfo, act: string) => (agent.path ? `${agent.path}: ${act}` : act);
  for (const agent of index.agents) {
    const own = new Map<string, MethodImplementation>();
    const implementations = Object.hasOwn(given, agent.path) ? given[agent.path]! : {};
    const methods = new Set<string>();
    for (const [actId, act] of actsOf(agent.decl.acts)) {
      if (act.kind !== 'method') continue;
      methods.add(actId);
      const implementation = Object.hasOwn(implementations, actId)
        ? implementations[actId]
        : undefined;
      if (implementation) own.set(actId, implementation);
      else if (act.body !== undefined && act.body.trim() !== '') {
        if (allowBodies) own.set(actId, compileMethodBody(act.body, actId));
        else bodies.push(name(agent, actId));
      } else if (act.provided) missing.push(name(agent, actId));
    }
    for (const style of Object.values(agent.decl.styles ?? {})) {
      for (const [actId, act] of actsOf(style.acts)) {
        if (
          act.kind === 'method' &&
          act.body !== undefined &&
          act.body.trim() !== '' &&
          !allowBodies
        )
          bodies.push(name(agent, actId));
        if (act.kind === 'method' && act.provided) missing.push(name(agent, actId));
      }
    }
    for (const actId of Object.keys(implementations)) {
      if (!methods.has(actId)) unknown.push(name(agent, actId));
    }
    found.set(agent, own);
  }
  for (const path of Object.keys(given)) {
    if (!index.agents.some((agent) => agent.path === path))
      unknown.push(...Object.keys(given[path]!).map((act) => (path ? `${path}: ${act}` : act)));
  }
  if (unknown.length > 0) {
    throw new Error(
      `Implementations are given for acts that are not methods of the model: ${unknown.map((m) => `\`${m}\``).join(', ')}`,
    );
  }
  if (bodies.length > 0 || missing.length > 0) throw new MethodCodeError(bodies, missing);
  return found;
}

function compileBehaviours(
  index: ModelIndex,
  functions: ReadonlyMap<string, FunctionEntry>,
  constants: ReadonlyMap<string, Constant>,
  methods: ReadonlyMap<AgentInfo, ReadonlyMap<string, MethodImplementation>>,
): void {
  const unsupported: string[] = [];
  for (const agent of index.agents) {
    agent.behaviour = new Behaviour(
      index,
      agent,
      agent.decl.acts,
      functions,
      constants,
      methods.get(agent),
    );
    for (const style of Object.values(agent.decl.styles ?? {})) {
      // A style's methods have no implementation: they do nothing, or, if
      // bodies are allowed, run their bodies.
      const styleMethods = new Map<string, MethodImplementation>();
      for (const [actId, act] of actsOf(style.acts)) {
        if (act.kind === 'method' && act.body !== undefined && act.body.trim() !== '')
          styleMethods.set(actId, compileMethodBody(act.body, actId));
      }
      agent.styles.push(
        new Behaviour(index, agent, style.acts, functions, constants, styleMethods),
      );
    }
    for (const [actId, act] of actsOf(agent.decl.acts)) {
      if (
        (act.kind === 'watch' || act.kind === 'derive') &&
        index.attribute(act.attribute).owner !== agent
      ) {
        unsupported.push(
          `${act.kind} \`${actId}\` of \`${agent.id}\` on another agent's attribute`,
        );
      }
      if (act.kind === 'diffuse' && agent.fills.length === 0) {
        unsupported.push(
          `diffuse \`${actId}\` of \`${agent.id}\`, which is not the cells of a grid`,
        );
      }
    }
  }
  if (unsupported.length > 0) throw new UnsupportedModelError(unsupported);
}

function actsUse(index: ModelIndex, functionId: string): boolean {
  return index.agents.some((agent) =>
    [agent.decl.acts, ...Object.values(agent.decl.styles ?? {}).map((style) => style.acts)].some(
      (group) =>
        actsOf(group).some(
          ([, act]) =>
            (act.kind === 'query' || act.kind === 'evaluate') && act.function === functionId,
        ),
    ),
  );
}

/** The model's parameters: the root scape's attributes and those of its spaces. */
function engineParameters(index: ModelIndex): ParameterSchema {
  const result: Record<string, Parameter> = {};
  const add = (key: string, attribute: AttributeInfo, label: string, group?: string) => {
    const decl = attribute.decl;
    if (decl.derived) return;
    const extra = {
      label,
      ...(decl.description !== undefined ? { description: decl.description } : {}),
      ...(decl.units !== undefined ? { unit: decl.units } : {}),
      ...(group !== undefined ? { group } : {}),
    };
    if (decl.type === 'state') {
      result[key] = {
        type: 'choice',
        options: attribute.options ?? [],
        default: String(attribute.initial),
        ...extra,
      };
      return;
    }
    switch (decl.type) {
      case 'integer':
      case 'real':
        result[key] = {
          type: decl.type === 'integer' ? 'int' : 'real',
          default: num(attribute.initial),
          ...(decl.min !== undefined ? { min: decl.min } : {}),
          ...(decl.max !== undefined ? { max: decl.max } : {}),
          ...extra,
        };
        break;
      case 'boolean':
        result[key] = { type: 'boolean', default: attribute.initial === true, ...extra };
        break;
      case 'symbol':
        result[key] = { type: 'text', default: String(attribute.initial), ...extra };
        break;
    }
  };
  for (const attribute of index.root.attributes) {
    add(attribute.id, attribute, attribute.decl.label ?? attribute.id);
  }
  for (const space of index.root.spaces) {
    for (const attribute of space.attributes) {
      add(
        attribute.ref,
        attribute,
        `${space.label} ${attribute.decl.label ?? attribute.id}`,
        space.label,
      );
    }
  }
  return result;
}

/** The colour and shape an agent is drawn with, from its first style; undefined if it has none. */
export function styleOf(agent: Agent): readonly Mark[] | undefined {
  if (!isHolder(agent) || agent.info.kind === 'space') return undefined;
  const style = agent.info.styles[0];
  const state = agent instanceof InterpScape ? agent.state : agent.context?.state;
  if (!style || !state) return undefined;
  return style.style(agent, state).marks;
}

/** One run of a compiled model: what `build` makes on a root scape. */
class World {
  readonly state: RunState;
  readonly #watchers = new Map<AttributeInfo, ((holder: Holder) => void)[]>();
  readonly #colors = new WeakMap<Agent, { version: number; color: Color | undefined }>();

  constructor(
    readonly index: ModelIndex,
    readonly root: RootScape,
    keepsOriginals: boolean,
  ) {
    const behaviours: Behaviours = {
      watchers: (info, attribute) => {
        let list = this.#watchers.get(attribute);
        if (!list) {
          const behaviour = info.behaviour;
          const ids = attribute.owner === info ? (behaviour?.watches.get(attribute.ref) ?? []) : [];
          list = ids.map(
            (id) => (holder: Holder) => behaviour!.run(id, holder as unknown as Agent, this.state),
          );
          this.#watchers.set(attribute, list);
        }
        return list;
      },
      derive: (info, attribute) => {
        const behaviour = info.behaviour;
        const id = attribute.owner === info ? behaviour?.derives.get(attribute.ref) : undefined;
        if (!behaviour || id === undefined) return undefined;
        return (holder) => behaviour.derive(id, holder as unknown as Agent, this.state);
      },
    };
    this.state = new RunState(root, index, behaviours);
    this.state.keepsOriginals = keepsOriginals;
    this.state.create = (type, scape) => this.#create(type, scape);
  }

  build(): void {
    const { index, root, state } = this;
    const model = index.model;
    const top = new InterpScape(index.root, undefined, state, state.uniqueName(model.id), true);
    index.root.attributes.forEach((attribute) => {
      if (!attribute.decl.derived)
        top.values[attribute.index] = root.parameters[attribute.id] as Datum;
    });
    state.scape = top;
    root.add(top);
    this.#addRules(top, index.root);
    this.#instantiate(top, root);
    this.#runBuilds(top);
    this.#record(top);
    if (state.keepsOriginals) {
      root.addScapeListener({ scapeInitialized: () => this.#keepOriginals(top) });
    }
    state.building = false;
  }

  /** Makes a scape instance's spaces and populations and adds them to `container`. */
  #instantiate(scape: InterpScape, container: Scape<Agent>): void {
    const { state } = this;
    for (const space of scape.info.spaces) {
      const values = space.attributes.map((attribute) => {
        if (scape !== state.scape) return attribute.initial;
        const value = this.root.parameters[attribute.ref];
        return value === undefined ? attribute.initial : (value as Datum);
      });
      const decl = space.decl;
      const name = this.#name(scape, space.label);
      if (decl.kind === 'grid') {
        const [width = 1, height = 1] = decl.dimensions.map((d) =>
          num(values[space.attribute.get(d)!.index]!),
        );
        const fill = space.fill;
        const options = { multiOccupancy: decl.multiOccupant ?? false };
        const cells = new Scape<Cell>({
          name,
          space:
            decl.neighborhood === 'vonNeumann'
              ? new Array2DVonNeumann<Cell>(options)
              : new Array2DMoore<Cell>(options),
          extent: [width, height],
          periodic: decl.borderRule === 'periodic',
          ...(fill ? { prototypeAgent: () => new InterpCell(fill, scape) } : {}),
          executionOrder: fill?.execution.order === 'agent' ? 'byAgent' : 'byRule',
          initialRulesAtStartOnly: true,
        });
        const instance = new GridInstance(space, scape, values, cells);
        state.grids.set(cells, instance);
        scape.spaces.set(space.id, instance);
        if (fill) this.#addRules(cells as unknown as Scape<Agent>, fill);
        container.add(cells);
        cells.populate();
      } else if (decl.kind === 'network') {
        const links = new Scape<Agent>({
          name,
          space: new Graph<Agent>({ directed: decl.directed ?? false }),
          randomStream: 'parent',
        });
        scape.spaces.set(space.id, new NetworkInstance(space, scape, values, links));
        container.add(links);
      } else if (decl.kind === 'continuous') {
        const [width = 1, height = 1] = decl.dimensions.map((d) =>
          num(values[space.attribute.get(d)!.index]!),
        );
        scape.spaces.set(
          space.id,
          new ContinuousInstance(
            space,
            scape,
            values,
            width,
            height,
            decl.borderRule === 'periodic',
          ),
        );
      }
    }
    for (const agent of scape.info.agents) {
      if (agent.fills.length > 0) continue;
      const continuous = agent.continuous ? this.#spaceIn(scape, agent.continuous) : undefined;
      const area = continuous instanceof ContinuousInstance ? continuous : undefined;
      const population = new Scape<Agent>({
        name: this.#name(scape, agent.decl.pluralLabel ?? agent.label),
        space: area
          ? (new Continuous2D<InterpAgent>() as unknown as Space<Agent>)
          : new ListSpace<Agent>(),
        ...(area ? { extent: [area.width, area.height] as const, periodic: area.periodic } : {}),
        executionOrder: agent.execution.order === 'agent' ? 'byAgent' : 'byRule',
        initialRulesAtStartOnly: true,
      });
      scape.populations.set(agent.id, population);
      area?.scapes.push(population);
      this.#addRules(population, agent);
      container.add(population);
    }
    if (state.building) this.#views(scape);
  }

  #name(scape: InterpScape, label: string): string {
    return this.state.uniqueName(scape === this.state.scape ? label : `${scape.name} ${label}`);
  }

  /** The instance of a space around a scape instance. */
  #spaceIn(scape: InterpScape, space: SpaceInfo): SpaceInstance | undefined {
    return enclosing(scape, space.context, this.state)?.spaces.get(space.id);
  }

  #runBuilds(scape: InterpScape): void {
    const behaviour = scape.info.behaviour;
    for (const build of behaviour?.builds ?? []) behaviour!.run(build.id, scape, this.state);
  }

  /** Creates an agent of a type in a scape instance. Cells of a grid are made by the grid, not created. */
  #create(type: AgentInfo, scape: InterpScape): Agent | undefined {
    const { state } = this;
    if (type.fills.length > 0) return undefined;
    const population = scape.populations.get(type.id);
    if (!population) return undefined;
    let agent: InterpAgent | InterpScape;
    if (type.kind === 'scape') {
      const nested = new InterpScape(
        type as ScapeInfo,
        scape,
        state,
        this.#name(scape, type.label),
        false,
      );
      population.add(nested);
      this.#instantiate(nested, nested);
      agent = nested;
    } else {
      agent = new InterpAgent(type, scape);
      population.add(agent);
    }
    if (type.grid) {
      const grid = this.#spaceIn(scape, type.grid);
      if (grid instanceof GridInstance) agent.hostScape = grid.scape as never;
    }
    for (const network of type.networks) {
      const instance = this.#spaceIn(scape, network);
      if (instance instanceof NetworkInstance) instance.enrol(agent);
    }
    state.restructured();
    if (agent instanceof InterpScape) this.#runBuilds(agent);
    return agent;
  }

  /** Adds an agent type's rules, schedules, diffusions and initialize acts to a scape. */
  #addRules(scape: Scape<Agent>, agent: AgentInfo): void {
    const behaviour = agent.behaviour;
    if (!behaviour) return;
    const { state } = this;
    const listed = agent.execution.rules ?? [];
    const rank = (id: string) => {
      const at = listed.indexOf(id);
      return at < 0 ? listed.length : at;
    };
    const rules = [...behaviour.rules].sort((a, b) => rank(a.id) - rank(b.id));
    const randomExecution = agent.execution.randomOrder ?? true;
    for (const { id, act } of rules) {
      const name = act.label ?? id;
      const description = act.description !== undefined ? { description: act.description } : {};
      if (act.kind === 'diffuse') {
        scape.addRule(this.#diffusion(act, name));
      } else if (act.kind === 'schedule') {
        const start = act.start ?? 0;
        const interval = Math.max(1, act.interval ?? 1);
        scape.addRule({
          name,
          ...description,
          randomExecution,
          execute: (member) => {
            const period = state.period;
            if (period >= start && (period - start) % interval === 0) {
              behaviour.run(id, member, state);
            }
          },
        });
      } else {
        scape.addRule({
          name,
          ...description,
          randomExecution,
          execute: (member) => behaviour.run(id, member, state),
        });
      }
    }
    for (const { id, act } of behaviour.initializers) {
      scape.addInitialRule({
        name: act.label ?? id,
        ...(act.description !== undefined ? { description: act.description } : {}),
        randomExecution,
        execute: (member) => behaviour.run(id, member, state),
      });
    }
  }

  /**
   * A diffusion (R17), as the Ascape generator's `ExecuteThenUpdate` rule:
   * each cell first works out its new value from its own and its neighbours'
   * (the grid's neighbourhood and border rule), then every cell takes its new
   * value. new = own + rate × (mean of neighbours − own), then × (1 −
   * evaporation). Without a rate the cell takes the mean; without an
   * evaporation rate nothing evaporates.
   */
  #diffusion(
    act: Extract<ReturnType<typeof actsOf>[number][1], { kind: 'diffuse' }>,
    name: string,
  ): Rule<Agent> {
    const { state, index } = this;
    const diffused = index.attribute(act.diffused);
    const rate = act.diffusionRate !== undefined ? index.attribute(act.diffusionRate) : undefined;
    const evaporation =
      act.evaporationRate !== undefined ? index.attribute(act.evaporationRate) : undefined;
    const read = (cell: Agent, attribute: AttributeInfo) =>
      num(state.read(holderFor(cell, attribute.owner, state), attribute));
    const pending = new Map<Agent, number>();
    return {
      name,
      ...(act.description !== undefined ? { description: act.description } : {}),
      randomExecution: false,
      causesRemoval: false,
      execute: (cell) => {
        const own = read(cell, diffused);
        const neighbors = (cell.scape.space as unknown as Array2DMoore<Cell>).neighbors(
          cell as Cell,
        );
        let value = own;
        if (neighbors.length > 0) {
          let sum = 0;
          for (const neighbor of neighbors) sum += read(neighbor, diffused);
          const mean = sum / neighbors.length;
          value = own + (mean - own) * (rate ? read(cell, rate) : 1);
        }
        if (evaporation) value *= 1 - read(cell, evaporation);
        pending.set(cell, value);
      },
      update: (cell) => {
        const value = pending.get(cell);
        if (value === undefined) return;
        pending.delete(cell);
        state.write(cell as InterpCell, diffused, value);
      },
    };
  }

  // ─────────────────────────── Statistics and views ───────────────────────────

  /** Collects the root scape's gathered attributes, and each population's size and gathered attributes. */
  #record(top: InterpScape): void {
    const { state } = this;
    const collect = (scape: Scape<Agent>, prefix: string, agent: AgentInfo, count: boolean) => {
      if (count) scape.addStatCollector(stat.count(`${prefix}.count`));
      for (const attribute of agent.attributes) {
        if (!attribute.decl.gatherData) continue;
        const id = `${prefix}.${attribute.id}`;
        const value = (member: Agent) => state.read(member as unknown as Holder, attribute);
        if (attribute.type === 'integer' || attribute.type === 'real') {
          scape.addStatCollector(stat.measure(id, (member) => num(value(member))));
        } else if (attribute.type === 'boolean') {
          scape.addStatCollector(stat.count(id, (member) => value(member) === true));
        } else if (attribute.options) {
          for (const option of attribute.options) {
            scape.addStatCollector(
              stat.count(`${id}.${option}`, (member) => value(member) === option),
            );
          }
        }
      }
    };
    collect(top, this.index.root.id, this.index.root, false);
    for (const agent of this.index.root.agents) {
      if (agent.fills.length > 0) {
        const grid = top.spaces.get(agent.fills[0]!.id);
        if (grid instanceof GridInstance)
          collect(grid.scape as Scape<Agent>, agent.id, agent, false);
      } else {
        const population = top.populations.get(agent.id);
        if (population) collect(population, agent.id, agent, true);
      }
    }
  }

  /** The colour an agent is drawn with: from its style, else its type's default colour. */
  #color(agent: Agent): Color | undefined {
    if (!isHolder(agent) || agent.info.kind === 'space') return undefined;
    const info = agent.info;
    const style = info.styles[0];
    if (!style) return PALETTE[info.position % PALETTE.length];
    const known = this.#colors.get(agent);
    if (known && known.version === this.state.version) return known.color;
    const marks = style.style(agent, this.state).marks;
    const mark = marks.find((m) => m.fill) ?? marks[0];
    const color = mark?.color;
    this.#colors.set(agent, { version: this.state.version, color });
    return color;
  }

  #views(scape: InterpScape): void {
    const prefix = scape === this.state.scape ? '' : `${scape.name}: `;
    for (const info of scape.info.spaces) {
      const instance = scape.spaces.get(info.id);
      const title = `${prefix}${info.label}`;
      if (instance instanceof GridInstance) {
        const fill = info.fill;
        const shape = info.members
          .map((member) => member.styles[0]?.firstShape)
          .find((found) => found !== undefined);
        instance.scape.addView(
          gridView({
            title,
            scape: instance.scape,
            ...(fill && fill.styles.length > 0
              ? { cellColor: (cell: Cell) => this.#color(cell) ?? 0xeeeeee }
              : {}),
            occupantColor: (occupant) => this.#color(occupant),
            ...(shape ? { occupantShape: shape === 'oval' ? 'circle' : 'square' } : {}),
          }),
        );
      } else if (instance instanceof NetworkInstance) {
        instance.scape.addView(
          networkView({
            title,
            nodes: instance.scape,
            graph: instance.graph,
            color: (agent) => this.#color(agent) ?? colors.gray,
          }),
        );
      } else if (instance instanceof ContinuousInstance) {
        for (const population of instance.scapes) {
          population.addView(
            continuousView({
              title: instance.scapes.length > 1 ? `${title}: ${population.name}` : title,
              scape: population as never,
              color: (agent: Agent) => this.#color(agent) ?? colors.gray,
            }),
          );
        }
      }
    }
  }

  /** Remembers every agent's values as they are once the model has started, for `original`. */
  #keepOriginals(scape: InterpScape): void {
    scape.originals = [...scape.values];
    for (const instance of scape.spaces.values()) {
      if (instance instanceof GridInstance) {
        for (const cell of instance.scape.members) {
          if (isHolder(cell)) cell.originals ??= [...cell.values];
        }
      }
    }
    for (const population of scape.populations.values()) {
      for (const member of population.members) {
        if (member instanceof InterpScape) this.#keepOriginals(member);
        else if (isHolder(member)) member.originals ??= [...member.values];
      }
    }
  }
}
