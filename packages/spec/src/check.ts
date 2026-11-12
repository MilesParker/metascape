// SPDX-License-Identifier: EPL-2.0
import { describeArgumentKind, fitsArgument, OPERATORS, operatorResult } from './operators';
import {
  ModelFormatError,
  parseModel,
  type Action,
  type AggregateKind,
  type Choice,
  type Diagnostic,
  type Expression,
  type ModelSpec,
  type Operator,
  type Selection,
} from './schema';
import {
  agentType,
  assignable,
  BOOLEAN,
  capitalize,
  COLOR,
  comparable,
  describeModel,
  gridOf,
  INT,
  isNumeric,
  REAL,
  RESERVED_ATTRIBUTES,
  RESERVED_VARIABLES,
  resolveReference,
  Scope,
  ScopeRoot,
  sharedSpace,
  suggest,
  typeName,
  type AgentInfo,
  type ModelInfo,
  type Type,
} from './types';

/**
 * Checks the meaning of a model: that every name resolves, every expression
 * is well typed, and every action, selection and space is used as the format
 * allows. Input that does not even fit the format's structure gets the
 * diagnostics of {@link parseModel} instead.
 *
 * @returns the problems found, each with the path of the offending part and a
 * message saying what was found and what was expected; empty if the model is valid.
 */
export function checkModel(spec: ModelSpec): Diagnostic[] {
  try {
    parseModel(spec);
  } catch (error) {
    if (error instanceof ModelFormatError) return [...error.diagnostics];
    throw error;
  }
  return new Checker(spec).run();
}

/** Throws a {@link ModelFormatError} listing every problem {@link checkModel} finds. */
export function assertValidModel(spec: ModelSpec): void {
  const diagnostics = checkModel(spec);
  if (diagnostics.length > 0) throw new ModelFormatError(diagnostics);
}

/** The statistics a numeric attribute's `record` asks for. */
export function recordedStatistics(
  record: boolean | readonly string[] | undefined,
): readonly string[] {
  if (record === true) return ['count', 'sum', 'mean', 'min', 'max'];
  return Array.isArray(record) ? [...new Set(record)] : [];
}

/** The ids of every data series a model records, in the order the compiler declares them. */
export function seriesIds(info: ModelInfo): string[] {
  const ids: string[] = [];
  for (const agent of info.agentList) {
    ids.push(`${agent.name}.count`);
    for (const attribute of agent.attributeList) {
      const spec = attribute.spec;
      if (spec.type === 'int' || spec.type === 'real') {
        for (const statistic of recordedStatistics(spec.record)) {
          ids.push(`${agent.name}.${attribute.name}.${statistic}`);
        }
      } else if (spec.type === 'boolean') {
        if (spec.record === true) ids.push(`${agent.name}.${attribute.name}`);
      } else if (spec.type === 'state' && spec.record === true) {
        for (const state of spec.states) ids.push(`${agent.name}.${attribute.name}.${state}`);
      }
    }
  }
  return ids;
}

const join = (path: string, key: string): string => (path ? `${path}.${key}` : key);
const isStateLiteral = (e: Expression | undefined): boolean =>
  typeof e === 'object' && 'state' in e;

/** A short rendering of an expression for messages. */
function show(e: Expression): string {
  if (typeof e === 'string') return `"${e}"`;
  if (typeof e !== 'object') return String(e);
  if ('state' in e) return `{ state: "${e.state}" }`;
  if ('color' in e) return e.color;
  if ('op' in e) return `"${e.op}"`;
  return `the ${e.aggregate} of "${e.over.type}"`;
}

function placeOf(agent: AgentInfo): string {
  const space = agent.space?.name;
  switch (agent.role) {
    case 'cell':
      return `"${agent.name}" is the cells of grid "${space}"`;
    case 'occupant':
      return `"${agent.name}" is on grid "${space}"`;
    case 'point':
      return `"${agent.name}" is in continuous space "${space}"`;
    case 'plain':
      return `"${agent.name}" is in no space`;
  }
}

const SPATIAL_SCOPES = ['neighbors', 'within', 'here'];
const SYNCHRONOUS_ACTIONS = ['let', 'if', 'with', 'forEach', 'set'];

/** The name of an action's kind: its first key. */
export function actionKind(action: Action): string {
  if ('to' in action) return 'set';
  if ('let' in action) return 'let';
  if ('if' in action) return 'if';
  if ('with' in action) return 'with';
  if ('forEach' in action) return 'forEach';
  if ('moveTo' in action) return 'moveTo';
  if ('moveBy' in action) return 'moveBy';
  if ('moveToward' in action) return 'moveToward';
  if ('die' in action) return 'die';
  if ('create' in action) return 'create';
  if ('connect' in action) return 'connect';
  if ('disconnect' in action) return 'disconnect';
  return 'stop';
}

interface Found {
  readonly target: AgentInfo | undefined;
  /** The scope with the selection's binding. */
  readonly scope: Scope;
}

class Checker {
  readonly #diagnostics: Diagnostic[] = [];
  readonly #info: ModelInfo;

  constructor(spec: ModelSpec) {
    this.#info = describeModel(spec);
  }

  run(): Diagnostic[] {
    this.#parameters();
    this.#spaces();
    this.#agents();
    this.#charts();
    const stopWhen = this.#info.spec.stopWhen;
    if (stopWhen !== undefined) {
      this.#condition(stopWhen, new Scope(new ScopeRoot('stopWhen', undefined)), 'stopWhen');
    }
    return this.#diagnostics;
  }

  #report(path: string, message: string): void {
    this.#diagnostics.push({ path, message });
  }

  // ──────────────────────────── Declarations ────────────────────────────

  #parameters(): void {
    for (const { name, spec } of this.#info.parameterList) {
      const path = `parameters.${name}`;
      if (spec.type === 'int' || spec.type === 'real') {
        if (spec.type === 'int' && !Number.isInteger(spec.default)) {
          this.#report(
            `${path}.default`,
            `Parameter "${name}" is an int, but its default ${spec.default} is not a whole number`,
          );
        }
        if (spec.min !== undefined && spec.default < spec.min) {
          this.#report(
            `${path}.default`,
            `The default ${spec.default} of parameter "${name}" is below its min ${spec.min}`,
          );
        }
        if (spec.max !== undefined && spec.default > spec.max) {
          this.#report(
            `${path}.default`,
            `The default ${spec.default} of parameter "${name}" is above its max ${spec.max}`,
          );
        }
      } else if (spec.type === 'choice' && !spec.options.includes(spec.default)) {
        this.#report(
          `${path}.default`,
          `The default "${spec.default}" of parameter "${name}" is not one of its options (${spec.options.join(', ')})`,
        );
      }
    }
  }

  #constant(e: Expression, label: string, path: string, want: 'int' | 'number'): void {
    const type = this.#expr(
      e,
      new Scope(new ScopeRoot(label, undefined, { constant: true })),
      path,
    );
    if (!type) return;
    if (want === 'int' && type.kind !== 'int') {
      this.#report(
        path,
        `${capitalize(label)} must be an int, found ${typeName(type)} ${show(e)}${type.kind === 'real' ? ' (use floor, ceil or round)' : ''}`,
      );
    } else if (want === 'number' && !isNumeric(type)) {
      this.#report(
        path,
        `${capitalize(label)} must be a number, found ${typeName(type)} ${show(e)}`,
      );
    }
  }

  #spaces(): void {
    for (const space of this.#info.spaceList) {
      const path = `spaces.${space.name}`;
      const spec = space.spec;
      if (spec.kind === 'network') {
        if (!this.#info.agents.has(spec.nodes)) {
          this.#report(
            `${path}.nodes`,
            `Unknown agent type "${spec.nodes}" for the nodes of network "${space.name}"${suggest(spec.nodes, this.#info.agents.keys())}`,
          );
        }
        const initial = spec.initial;
        if (initial && initial.topology !== 'none') {
          if (initial.topology !== 'random') {
            this.#constant(initial.k, `k of network "${space.name}"`, `${path}.initial.k`, 'int');
          }
          if (initial.topology !== 'ring') {
            this.#constant(
              initial.probability,
              `the probability of network "${space.name}"`,
              `${path}.initial.probability`,
              'number',
            );
          }
        }
        continue;
      }
      for (const dimension of ['width', 'height'] as const) {
        this.#constant(
          spec[dimension],
          `the ${dimension} of ${spec.kind === 'grid' ? 'grid' : 'continuous space'} "${space.name}"`,
          `${path}.${dimension}`,
          spec.kind === 'grid' ? 'int' : 'number',
        );
      }
      if (spec.kind === 'grid' && !space.cellType) {
        this.#report(
          path,
          `Grid "${space.name}" has no cell type: give one agent type space: "${space.name}" and as: "cell"`,
        );
      }
    }
  }

  #agents(): void {
    for (const agent of this.#info.agentList) {
      const path = `agents.${agent.name}`;
      const spec = agent.spec;
      const space = spec.space === undefined ? undefined : this.#info.spaces.get(spec.space);
      if (spec.space !== undefined) {
        if (!space) {
          this.#report(
            `${path}.space`,
            `Unknown space "${spec.space}" for agent type "${agent.name}"${suggest(spec.space, this.#info.spaces.keys())}`,
          );
        } else if (space.spec.kind === 'network') {
          this.#report(
            `${path}.space`,
            `Agent type "${agent.name}" cannot live in network "${spec.space}": give it a grid or continuous space (or none) and name it as the network's nodes`,
          );
        }
      }
      if (spec.as !== undefined && agent.role !== 'cell' && agent.role !== 'occupant') {
        this.#report(
          `${path}.as`,
          `"as" is only for agents on a grid, and "${agent.name}" ${space ? `lives in ${space.spec.kind} space "${space.name}"` : 'has no grid'}`,
        );
      }
      if (agent.role === 'cell' && agent.space?.cellType !== agent) {
        this.#report(
          `${path}.as`,
          `Grid "${agent.space?.name}" already has cell type "${agent.space?.cellType?.name}"; a grid has exactly one, so "${agent.name}" cannot also be its cells`,
        );
      }
      if (spec.count !== undefined) {
        if (agent.role === 'cell') {
          this.#report(
            `${path}.count`,
            `Cell type "${agent.name}" cannot have a count: grid "${agent.space?.name}" has one cell per site`,
          );
        } else {
          this.#constant(spec.count, `the count of "${agent.name}"`, `${path}.count`, 'int');
        }
      }
      for (const attribute of agent.attributeList) {
        const attributePath = `${path}.attributes.${attribute.name}`;
        if ((RESERVED_ATTRIBUTES as readonly string[]).includes(attribute.name)) {
          this.#report(
            attributePath,
            `"${attribute.name}" is reserved and cannot name an attribute (reserved: ${RESERVED_ATTRIBUTES.join(', ')})`,
          );
        }
        const initial = attribute.spec.initial;
        if (initial !== undefined) {
          const root = new ScopeRoot(
            `the initial value of "${agent.name}.${attribute.name}"`,
            agent,
            {
              attributeLimit: attribute.index,
            },
          );
          this.#value(
            initial,
            new Scope(root),
            `${attributePath}.initial`,
            attribute.type,
            () => `The initial value of "${attribute.name}"`,
          );
        }
      }
      this.#actions(
        spec.initialize,
        new Scope(new ScopeRoot(`the initialize actions of "${agent.name}"`, agent)),
        `${path}.initialize`,
        false,
      );
      spec.rules?.forEach((rule, index) => {
        const rulePath = `${path}.rules[${index}]`;
        const scope = new Scope(new ScopeRoot(`rule "${rule.name}" of "${agent.name}"`, agent));
        if (rule.when !== undefined) this.#condition(rule.when, scope, `${rulePath}.when`);
        this.#actions(rule.do, scope, `${rulePath}.do`, rule.synchronous === true);
      });
      const style = spec.style;
      if (style) {
        const scope = new Scope(
          new ScopeRoot(`the style of "${agent.name}"`, agent, { noRandom: true }),
        );
        if (style.color !== undefined) {
          this.#value(style.color, scope, `${path}.style.color`, COLOR, () => 'The style color');
        }
        if (style.hidden !== undefined) {
          this.#condition(style.hidden, scope, `${path}.style.hidden`);
        }
      }
    }
  }

  #charts(): void {
    const ids = seriesIds(this.#info);
    const known = new Set(ids);
    this.#info.spec.charts?.forEach((chart, chartIndex) => {
      chart.series.forEach((id, index) => {
        if (known.has(id)) return;
        this.#report(`charts[${chartIndex}].series[${index}]`, this.#seriesProblem(id, ids));
      });
    });
  }

  #seriesProblem(id: string, ids: readonly string[]): string {
    const [agentName = '', attributeName, ...rest] = id.split('.');
    const agent = this.#info.agents.get(agentName);
    const attribute =
      attributeName === undefined ? undefined : agent?.attributes.get(attributeName);
    if (agent && attribute) {
      const spec = attribute.spec;
      const numeric = spec.type === 'int' || spec.type === 'real';
      const recorded = numeric ? recordedStatistics(spec.record).length > 0 : spec.record === true;
      if (!recorded) {
        return `Series "${id}" is not recorded: add record: true to attribute "${attribute.name}" of "${agent.name}"`;
      }
      if (numeric && rest.length === 1) {
        return `Series "${id}": attribute "${attribute.name}" of "${agent.name}" records only ${recordedStatistics(spec.record).join(', ')}${suggest(id, ids)}`;
      }
    }
    return `Unknown series "${id}"${suggest(id, ids)}. Series are <agentType>.count, <agentType>.<attribute>.<statistic> for numbers, <agentType>.<attribute> for booleans and <agentType>.<attribute>.<state> for states`;
  }

  // ────────────────────────────── Actions ───────────────────────────────

  #actions(list: readonly Action[] | undefined, scope: Scope, path: string, sync: boolean): void {
    if (!list) return;
    const inner = scope.child();
    list.forEach((action, index) => this.#action(action, inner, `${path}[${index}]`, sync));
  }

  #action(action: Action, scope: Scope, path: string, sync: boolean): void {
    const self = scope.root.self;
    const kind = actionKind(action);
    if (sync && !SYNCHRONOUS_ACTIONS.includes(kind)) {
      this.#report(
        path,
        `"${kind}" is not allowed in a synchronous rule: only let, if, with, forEach and set on attributes of self are`,
      );
      return;
    }
    if (!self) return;

    if ('to' in action) {
      this.#set(action.set, action.to, scope, path, sync);
    } else if ('let' in action) {
      const name = action.let;
      let ok = true;
      if ((RESERVED_VARIABLES as readonly string[]).includes(name)) {
        this.#report(`${path}.let`, `"${name}" is reserved and cannot name a variable`);
        ok = false;
      } else if (scope.find(name)) {
        this.#report(
          `${path}.let`,
          `"${name}" is already in scope; choose a different name for this variable`,
        );
        ok = false;
      }
      const type = this.#expr(action.value, scope, `${path}.value`);
      if (type && ok) scope.declare(name, type);
    } else if ('if' in action) {
      this.#condition(action.if, scope, `${path}.if`);
      this.#actions(action.then, scope, `${path}.then`, sync);
      this.#actions(action.else, scope, `${path}.else`, sync);
    } else if ('with' in action) {
      const found = this.#choice(action.with, scope, `${path}.with`);
      this.#actions(action.do, found.scope, `${path}.do`, sync);
      this.#actions(action.else, scope, `${path}.else`, sync);
    } else if ('forEach' in action) {
      const found = this.#selection(action.forEach, scope, `${path}.forEach`);
      this.#actions(action.do, found.scope, `${path}.do`, sync);
    } else if ('moveTo' in action) {
      this.#moveTo(action.moveTo, self, scope, `${path}.moveTo`);
    } else if ('moveBy' in action) {
      if (self.role !== 'point') {
        this.#report(
          `${path}.moveBy`,
          `moveBy is for agents in a continuous space, and "${self.name}" is not one${self.role === 'occupant' ? '; use moveTo on a grid' : ''}`,
        );
      }
      this.#numeric(action.moveBy.dx, scope, `${path}.moveBy.dx`);
      this.#numeric(action.moveBy.dy, scope, `${path}.moveBy.dy`);
    } else if ('moveToward' in action) {
      if (self.role !== 'point') {
        this.#report(
          `${path}.moveToward`,
          `moveToward is for agents in a continuous space, and "${self.name}" is not one${self.role === 'occupant' ? '; use moveTo on a grid' : ''}`,
        );
      }
      const target = this.#agentReference(action.moveToward, scope, `${path}.moveToward`);
      if (target && self.role === 'point' && sharedSpace(self, target) === undefined) {
        this.#report(
          `${path}.moveToward`,
          `moveToward needs a target in continuous space "${self.space?.name}", but "${action.moveToward}" is of type "${target.name}" and ${placeOf(target)}`,
        );
      }
      this.#numeric(action.distance, scope, `${path}.distance`);
    } else if ('die' in action) {
      const target =
        action.die === true ? self : this.#agentReference(action.die, scope, `${path}.die`);
      if (target?.role === 'cell') {
        this.#report(
          `${path}.die`,
          `Cells cannot die: "${target.name}" forms grid "${target.space?.name}"; change an attribute instead`,
        );
      }
    } else if ('create' in action) {
      this.#create(action, self, scope, path);
    } else if ('connect' in action || 'disconnect' in action) {
      const [key, reference] =
        'connect' in action
          ? (['connect', action.connect] as const)
          : (['disconnect', action.disconnect] as const);
      const other = this.#agentReference(reference, scope, `${path}.${key}`);
      const network = this.#network(action.network, `${path}.network`);
      if (network) {
        if (self.name !== network.nodes) {
          this.#report(
            `${path}.network`,
            `Network "${action.network}" links agents of type "${network.nodes}", but the acting agent is a "${self.name}"`,
          );
        }
        if (other && other.name !== network.nodes) {
          this.#report(
            `${path}.${key}`,
            `Network "${action.network}" links agents of type "${network.nodes}", but "${reference}" is a "${other.name}"`,
          );
        }
      }
    }
  }

  #set(target: string, value: Expression, scope: Scope, path: string, sync: boolean): void {
    const resolution = resolveReference(this.#info, target, scope);
    let expected: Type | undefined;
    if (!resolution.ok) {
      this.#report(`${path}.set`, resolution.message);
    } else {
      const resolved = resolution.value;
      const last = resolved.kind === 'path' ? resolved.steps.at(-1) : undefined;
      if (resolved.kind !== 'path' || last?.kind !== 'attribute') {
        this.#report(
          `${path}.set`,
          `"${target}" cannot be set: set changes an attribute of an agent, such as "energy" or "other.energy"`,
        );
      } else if (sync && (resolved.base !== 'self' || resolved.steps.length !== 1)) {
        this.#report(
          `${path}.set`,
          `In a synchronous rule, set may change only attributes of self, not "${target}"`,
        );
      } else {
        expected = resolved.type;
      }
    }
    this.#value(value, scope, `${path}.to`, expected, () => `Cannot set "${target}": it`);
  }

  #moveTo(choice: Choice, self: AgentInfo, scope: Scope, path: string): void {
    const grid = self.role === 'occupant' ? self.space : undefined;
    if (!grid) {
      this.#report(
        path,
        `moveTo is for occupants of a grid, and "${self.name}" is not one${self.role === 'point' ? '; use moveBy or moveToward in a continuous space' : ''}`,
      );
    }
    const { target } = this.#choice(choice, scope, path);
    if (!grid || !target || target === grid.cellType) return;
    const multi = grid.spec.kind === 'grid' && grid.spec.multiOccupancy === true;
    if (target.role === 'occupant' && target.space === grid) {
      if (!multi) {
        this.#report(
          `${path}.type`,
          `moveTo onto an agent of type "${target.name}" needs grid "${grid.name}" to allow multiOccupancy; otherwise move to a cell of type "${grid.cellType?.name}"`,
        );
      }
      return;
    }
    this.#report(
      `${path}.type`,
      `moveTo needs a cell of grid "${grid.name}" (type "${grid.cellType?.name}") or an agent on that grid, but ${placeOf(target)}`,
    );
  }

  #create(
    action: Extract<Action, { create: string }>,
    self: AgentInfo,
    scope: Scope,
    path: string,
  ): void {
    const type = this.#info.agents.get(action.create);
    if (!type) {
      this.#report(
        `${path}.create`,
        `Unknown agent type "${action.create}"${suggest(action.create, this.#info.agents.keys())}`,
      );
    } else if (type.role === 'cell') {
      this.#report(
        `${path}.create`,
        `Cannot create agents of type "${action.create}": they are the cells of grid "${type.space?.name}", which are fixed`,
      );
    }
    if (action.count !== undefined) this.#integer(action.count, scope, `${path}.count`);
    if (type && (action.at === 'here' || action.at === 'neighbor')) {
      if (!type.space || type.space !== self.space) {
        this.#report(
          `${path}.at`,
          `at: "${action.at}" needs the creator and the created agent in the same space, but ${placeOf(self)} and ${placeOf(type)}`,
        );
      } else if (action.at === 'neighbor' && type.space.spec.kind !== 'grid') {
        this.#report(
          `${path}.at`,
          `at: "neighbor" needs a grid, and "${type.space.name}" is a continuous space; use "here" or "random"`,
        );
      }
    }
    for (const [key, value] of Object.entries(action.set ?? {})) {
      const attribute = type?.attributes.get(key);
      if (type && !attribute) {
        this.#report(
          `${path}.set.${key}`,
          `Agent type "${type.name}" has no attribute "${key}"${suggest(key, type.attributes.keys())}`,
        );
      }
      this.#value(value, scope, `${path}.set.${key}`, attribute?.type, () => `Attribute "${key}"`);
    }
  }

  #network(name: string, path: string): { nodes: string } | undefined {
    const space = this.#info.spaces.get(name);
    if (!space) {
      const networks = this.#info.spaceList
        .filter((s) => s.spec.kind === 'network')
        .map((s) => s.name);
      this.#report(path, `Unknown network "${name}"${suggest(name, networks)}`);
      return undefined;
    }
    if (space.spec.kind !== 'network') {
      this.#report(path, `"${name}" is a ${space.spec.kind} space, not a network`);
      return undefined;
    }
    return { nodes: space.spec.nodes };
  }

  // ───────────────────────────── Selections ─────────────────────────────

  #selection(selection: Selection, scope: Scope, path: string): Found {
    const info = this.#info;
    const root = scope.root;
    const target = info.agents.get(selection.type);
    if (!target) {
      this.#report(
        `${path}.type`,
        `Unknown agent type "${selection.type}"${suggest(selection.type, info.agents.keys())}`,
      );
    }
    let origin: AgentInfo | undefined;
    if (selection.of !== undefined) {
      origin = this.#agentReference(selection.of, scope, `${path}.of`);
    } else if (root.self) {
      origin = root.self;
    } else if (selection.from !== 'all') {
      this.#report(
        path,
        `from: "${selection.from}" needs an origin agent, but ${root.label} has no acting agent; use from: "all" or give "of"`,
      );
    }
    if (target && origin) this.#relation(selection, origin, target, path);
    if (selection.from === 'within') {
      if (selection.radius === undefined) {
        this.#report(path, `from: "within" needs a radius`);
      } else {
        this.#numeric(selection.radius, scope, `${path}.radius`);
      }
    } else if (selection.radius !== undefined) {
      this.#report(
        `${path}.radius`,
        `"radius" is only used with from: "within", not "${selection.from}"`,
      );
    }
    if (selection.from !== 'linked' && selection.network !== undefined) {
      this.#report(
        `${path}.network`,
        `"network" is only used with from: "linked", not "${selection.from}"`,
      );
    }
    const name = selection.as ?? 'other';
    const inner = scope.child();
    if ((RESERVED_VARIABLES as readonly string[]).includes(name)) {
      this.#report(`${path}.as`, `"${name}" is reserved and cannot name a selection's binding`);
    } else if (scope.find(name)) {
      this.#report(
        `${path}.as`,
        `"${name}" is already in scope; give this selection a different name with as`,
      );
    }
    if (target) inner.declare(name, agentType(target.name));
    if (selection.where !== undefined) this.#condition(selection.where, inner, `${path}.where`);
    return { target, scope: inner };
  }

  #relation(selection: Selection, origin: AgentInfo, target: AgentInfo, path: string): void {
    const from = selection.from;
    switch (from) {
      case 'neighbors':
      case 'here': {
        const grid = gridOf(origin);
        if (!grid || gridOf(target) !== grid) {
          this.#report(
            `${path}.from`,
            `from: "${from}" needs the origin and "${target.name}" on the same grid, but ${placeOf(origin)} and ${placeOf(target)}`,
          );
        }
        return;
      }
      case 'within':
        if (!sharedSpace(origin, target)) {
          this.#report(
            `${path}.from`,
            `from: "within" needs the origin and "${target.name}" in the same grid or continuous space, but ${placeOf(origin)} and ${placeOf(target)}`,
          );
        }
        return;
      case 'linked': {
        if (selection.network === undefined) {
          this.#report(path, `from: "linked" needs a network`);
          return;
        }
        const network = this.#network(selection.network, `${path}.network`);
        if (!network) return;
        if (origin.name !== network.nodes) {
          this.#report(
            `${path}.network`,
            `Network "${selection.network}" links agents of type "${network.nodes}", but the origin is a "${origin.name}"`,
          );
        }
        if (target.name !== network.nodes) {
          this.#report(
            `${path}.type`,
            `Network "${selection.network}" links agents of type "${network.nodes}", not "${target.name}"`,
          );
        }
        return;
      }
      case 'all':
        return;
    }
  }

  #choice(choice: Choice, scope: Scope, path: string): Found {
    const found = this.#selection(choice, scope, path);
    const pick = choice.pick;
    if (pick === 'nearest' && !SPATIAL_SCOPES.includes(choice.from)) {
      this.#report(
        `${path}.pick`,
        `pick: "nearest" needs a spatial selection (from: neighbors, within or here), not from: "${choice.from}"`,
      );
    } else if (typeof pick === 'object') {
      const key = 'max' in pick ? 'max' : 'min';
      this.#numeric('max' in pick ? pick.max : pick.min, found.scope, `${path}.pick.${key}`);
    }
    return found;
  }

  // ──────────────────────────── Expressions ─────────────────────────────

  #agentReference(reference: string, scope: Scope, path: string): AgentInfo | undefined {
    const resolution = resolveReference(this.#info, reference, scope);
    if (!resolution.ok) {
      this.#report(path, resolution.message);
      return undefined;
    }
    const type = resolution.value.type;
    if (type.kind !== 'agent') {
      this.#report(path, `"${reference}" must be an agent, but it is ${typeName(type)}`);
      return undefined;
    }
    return this.#info.agents.get(type.agent);
  }

  /** Checks an expression wanted as `expected`; `subject` starts the mismatch message. */
  #value(
    e: Expression,
    scope: Scope,
    path: string,
    expected: Type | undefined,
    subject: () => string,
  ): void {
    const type = this.#expr(e, scope, path, expected);
    if (type && expected && !assignable(type, expected)) {
      this.#report(
        path,
        `${subject()} must be ${typeName(expected)}, found ${typeName(type)} ${show(e)}${expected.kind === 'int' && type.kind === 'real' ? ' (use floor, ceil or round)' : ''}`,
      );
    }
  }

  #condition(e: Expression, scope: Scope, path: string): void {
    const type = this.#expr(e, scope, path, BOOLEAN);
    if (type && type.kind !== 'boolean') {
      this.#report(path, `Expected a condition (a boolean), found ${typeName(type)} ${show(e)}`);
    }
  }

  #numeric(e: Expression, scope: Scope, path: string): void {
    const type = this.#expr(e, scope, path);
    if (type && !isNumeric(type)) {
      this.#report(path, `Expected a number, found ${typeName(type)} ${show(e)}`);
    }
  }

  #integer(e: Expression, scope: Scope, path: string): void {
    const type = this.#expr(e, scope, path, INT);
    if (type && type.kind !== 'int') {
      this.#report(
        path,
        `Expected an int, found ${typeName(type)} ${show(e)}${type.kind === 'real' ? ' (use floor, ceil or round)' : ''}`,
      );
    }
  }

  /** The type of an expression, or `undefined` after reporting why it has none. */
  #expr(e: Expression, scope: Scope, path: string, expected?: Type): Type | undefined {
    if (typeof e === 'number') return Number.isInteger(e) ? INT : REAL;
    if (typeof e === 'boolean') return BOOLEAN;
    if (typeof e === 'string') {
      const resolution = resolveReference(this.#info, e, scope);
      if (!resolution.ok) {
        this.#report(path, resolution.message);
        return undefined;
      }
      return resolution.value.type;
    }
    if ('state' in e) {
      if (expected?.kind === 'state') {
        if (!expected.states.includes(e.state)) {
          this.#report(
            path,
            `"${e.state}" is not a state of ${expected.agent}.${expected.attribute}, whose states are ${expected.states.join(', ')}${suggest(e.state, expected.states)}`,
          );
        }
        return expected;
      }
      this.#report(
        path,
        expected
          ? `The state "${e.state}" cannot be used where ${typeName(expected)} is expected`
          : `The state "${e.state}" needs a context that gives its type: compare it with eq or ne to a state attribute, or assign it to one`,
      );
      return undefined;
    }
    if ('color' in e) return COLOR;
    if ('op' in e) return this.#operation(e.op, e.args, scope, path, expected);
    return this.#aggregate(e.aggregate, e.over, e.of, scope, path);
  }

  #operation(
    op: Operator,
    args: readonly Expression[],
    scope: Scope,
    path: string,
    expected: Type | undefined,
  ): Type | undefined {
    const signature = OPERATORS[op];
    const count = signature.args.length;
    if (signature.variadic ? args.length < count : args.length !== count) {
      this.#report(
        path,
        `"${op}" takes ${signature.variadic ? 'at least ' : ''}${count} argument${count === 1 ? '' : 's'}, found ${args.length}`,
      );
      return undefined;
    }
    const root = scope.root;
    if (signature.random && (root.options.constant || root.options.noRandom)) {
      this.#report(path, `"${op}" draws random numbers, which ${root.label} may not use`);
      return undefined;
    }
    const argPath = (index: number): string => `${path}.args[${index}]`;

    if (op === 'eq' || op === 'ne') {
      const [a, b] = args as [Expression, Expression];
      let typeA: Type | undefined;
      let typeB: Type | undefined;
      if (isStateLiteral(a) && !isStateLiteral(b)) {
        typeB = this.#expr(b, scope, argPath(1));
        typeA = this.#expr(a, scope, argPath(0), typeB);
      } else {
        typeA = this.#expr(a, scope, argPath(0));
        typeB = this.#expr(b, scope, argPath(1), typeA);
      }
      if (typeA && typeB && !comparable(typeA, typeB)) {
        this.#report(
          path,
          `"${op}" compares ${typeName(typeA)} ${show(a)} with ${typeName(typeB)} ${show(b)}; they must have the same type`,
        );
      }
      return BOOLEAN;
    }

    if (op === 'if') {
      const [condition, then, otherwise] = args as [Expression, Expression, Expression];
      this.#condition(condition, scope, argPath(0));
      let thenType: Type | undefined;
      let elseType: Type | undefined;
      if (isStateLiteral(then) && !isStateLiteral(otherwise)) {
        elseType = this.#expr(otherwise, scope, argPath(2), expected);
        thenType = this.#expr(then, scope, argPath(1), elseType ?? expected);
      } else {
        thenType = this.#expr(then, scope, argPath(1), expected);
        elseType = this.#expr(otherwise, scope, argPath(2), thenType ?? expected);
      }
      if (!thenType || !elseType) return undefined;
      if (!comparable(thenType, elseType)) {
        this.#report(
          path,
          `The branches of "if" must have the same type, found ${typeName(thenType)} ${show(then)} and ${typeName(elseType)} ${show(otherwise)}`,
        );
        return undefined;
      }
      return operatorResult('if', [BOOLEAN, thenType, elseType]);
    }

    let ok = true;
    const types: Type[] = [];
    args.forEach((arg, index) => {
      const kind = signature.args[Math.min(index, count - 1)] ?? 'any';
      const type = this.#expr(arg, scope, argPath(index));
      if (!type) {
        ok = false;
        return;
      }
      if (!fitsArgument(kind, type)) {
        this.#report(
          argPath(index),
          `"${op}" needs ${describeArgumentKind(kind)} as argument ${index + 1}, found ${typeName(type)} ${show(arg)}${kind === 'int' && type.kind === 'real' ? ' (use floor, ceil or round)' : ''}`,
        );
        ok = false;
      }
      types.push(type);
    });
    if (!ok) return undefined;
    if (op === 'distance') {
      const [a, b] = types.map((type) =>
        type.kind === 'agent' ? this.#info.agents.get(type.agent) : undefined,
      );
      if (a && b && !sharedSpace(a, b)) {
        this.#report(
          path,
          `"distance" needs two agents in the same grid or continuous space, but ${placeOf(a)} and ${placeOf(b)}`,
        );
        return undefined;
      }
    }
    return operatorResult(op, types);
  }

  #aggregate(
    aggregate: AggregateKind,
    over: Selection,
    of: Expression | undefined,
    scope: Scope,
    path: string,
  ): Type | undefined {
    const root = scope.root;
    if (root.options.constant) {
      this.#report(
        path,
        `${capitalize(root.label)} may use only literals, operators and parameters; found the ${aggregate} of "${over.type}"`,
      );
      return undefined;
    }
    const found = this.#selection(over, scope, join(path, 'over'));
    if (aggregate === 'count' || aggregate === 'any' || aggregate === 'all') {
      if (of !== undefined) this.#condition(of, found.scope, `${path}.of`);
      return aggregate === 'count' ? INT : BOOLEAN;
    }
    if (of === undefined) {
      this.#report(
        path,
        `"${aggregate}" needs "of": the number to combine for each "${over.type}" found`,
      );
      return undefined;
    }
    const type = this.#expr(of, found.scope, `${path}.of`);
    if (!type) return undefined;
    if (!isNumeric(type)) {
      this.#report(
        `${path}.of`,
        `"${aggregate}" needs a number for "of", found ${typeName(type)} ${show(of)}`,
      );
      return undefined;
    }
    return aggregate === 'mean' ? REAL : type;
  }
}
