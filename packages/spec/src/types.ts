// SPDX-License-Identifier: EPL-2.0
import type { AgentSpec, AttributeSpec, ModelSpec, ParameterSpec, SpaceSpec } from './schema';

/*
 * The static model shared by the checker and the compiler: value types,
 * what each agent type and space is, lexical scopes, and how a reference
 * resolves. Internal to the package.
 */

/** The type of a value. */
export type Type =
  | { readonly kind: 'int' }
  | { readonly kind: 'real' }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'color' }
  /** The options of one particular state attribute. */
  | {
      readonly kind: 'state';
      readonly agent: string;
      readonly attribute: string;
      readonly states: readonly string[];
    }
  /** An agent of one type. */
  | { readonly kind: 'agent'; readonly agent: string };

export const INT: Type = { kind: 'int' };
export const REAL: Type = { kind: 'real' };
export const BOOLEAN: Type = { kind: 'boolean' };
export const COLOR: Type = { kind: 'color' };
export const agentType = (agent: string): Type => ({ kind: 'agent', agent });

export const isNumeric = (type: Type): boolean => type.kind === 'int' || type.kind === 'real';

/** How a type is named in messages. */
export function typeName(type: Type): string {
  switch (type.kind) {
    case 'state':
      return `a state of ${type.agent}.${type.attribute} (${type.states.join(', ')})`;
    case 'agent':
      return `an agent of type "${type.agent}"`;
    case 'int':
      return 'an int';
    default:
      return `a ${type.kind}`;
  }
}

/** Whether a value of type `found` may be used where `expected` is wanted. */
export function assignable(found: Type, expected: Type): boolean {
  if (expected.kind === 'real') return isNumeric(found);
  if (found.kind !== expected.kind) return false;
  if (found.kind === 'state' && expected.kind === 'state') {
    return found.agent === expected.agent && found.attribute === expected.attribute;
  }
  if (found.kind === 'agent' && expected.kind === 'agent') return found.agent === expected.agent;
  return true;
}

/** Whether two values can be compared with `eq` and `ne`. */
export function comparable(a: Type, b: Type): boolean {
  return assignable(a, b) || assignable(b, a);
}

// ───────────────────────────── Model structure ──────────────────────────

/** Names an attribute may not have, because references use them for something else. */
export const RESERVED_ATTRIBUTES = [
  'self',
  'param',
  'space',
  'tick',
  'x',
  'y',
  'id',
  'cell',
  'count',
] as const;
/** Names a local variable or selection binding may not have. */
export const RESERVED_VARIABLES = ['self', 'param', 'space', 'tick'] as const;

export interface AttributeInfo {
  readonly name: string;
  /** Position in declaration order, which is also the storage slot. */
  readonly index: number;
  readonly type: Type;
  readonly spec: AttributeSpec;
}

/**
 * Where an agent type lives:
 * - `cell`: the lattice of a grid
 * - `occupant`: stands on the cells of a grid
 * - `point`: has a position in a continuous space
 * - `plain`: no position (it may still be a network's nodes)
 */
export type AgentRole = 'cell' | 'occupant' | 'point' | 'plain';

export interface AgentInfo {
  readonly name: string;
  readonly index: number;
  readonly spec: AgentSpec;
  readonly role: AgentRole;
  /** The grid or continuous space, for every role but `plain`. */
  readonly space: SpaceInfo | undefined;
  readonly attributes: ReadonlyMap<string, AttributeInfo>;
  readonly attributeList: readonly AttributeInfo[];
}

export interface SpaceInfo {
  readonly name: string;
  readonly index: number;
  readonly spec: SpaceSpec;
  /** For a grid: the first agent type declared as its cells. */
  cellType: AgentInfo | undefined;
  readonly occupants: AgentInfo[];
  readonly points: AgentInfo[];
}

export interface ParameterInfo {
  readonly name: string;
  readonly index: number;
  readonly spec: ParameterSpec;
  /** `undefined` for choice and text parameters, which expressions cannot use. */
  readonly type: Type | undefined;
}

export interface ModelInfo {
  readonly spec: ModelSpec;
  readonly agents: ReadonlyMap<string, AgentInfo>;
  readonly agentList: readonly AgentInfo[];
  readonly spaces: ReadonlyMap<string, SpaceInfo>;
  readonly spaceList: readonly SpaceInfo[];
  readonly parameters: ReadonlyMap<string, ParameterInfo>;
  readonly parameterList: readonly ParameterInfo[];
}

function attributeType(agent: string, name: string, spec: AttributeSpec): Type {
  switch (spec.type) {
    case 'int':
      return INT;
    case 'real':
      return REAL;
    case 'boolean':
      return BOOLEAN;
    case 'state':
      return { kind: 'state', agent, attribute: name, states: spec.states };
  }
}

/**
 * Describes a structurally valid model. Tolerant of meaning errors: an agent
 * whose space is missing or not a grid or continuous space is treated as
 * `plain`, and the checker reports the problem.
 */
export function describeModel(spec: ModelSpec): ModelInfo {
  const spaces = new Map<string, SpaceInfo>();
  for (const [name, space] of Object.entries(spec.spaces ?? {})) {
    spaces.set(name, {
      name,
      index: spaces.size,
      spec: space,
      cellType: undefined,
      occupants: [],
      points: [],
    });
  }
  const agents = new Map<string, AgentInfo>();
  for (const [name, agent] of Object.entries(spec.agents)) {
    const space = agent.space === undefined ? undefined : spaces.get(agent.space);
    let role: AgentRole = 'plain';
    if (space?.spec.kind === 'grid') {
      role = agent.as === 'cell' ? 'cell' : 'occupant';
    } else if (space?.spec.kind === 'continuous') {
      role = 'point';
    }
    const attributeList = Object.entries(agent.attributes ?? {}).map(
      ([attribute, attributeSpec], index): AttributeInfo => ({
        name: attribute,
        index,
        type: attributeType(name, attribute, attributeSpec),
        spec: attributeSpec,
      }),
    );
    const info: AgentInfo = {
      name,
      index: agents.size,
      spec: agent,
      role,
      space: role === 'plain' ? undefined : space,
      attributes: new Map(attributeList.map((attribute) => [attribute.name, attribute])),
      attributeList,
    };
    agents.set(name, info);
    if (space && role === 'cell') space.cellType ??= info;
    if (space && role === 'occupant') space.occupants.push(info);
    if (space && role === 'point') space.points.push(info);
  }
  const parameters = new Map<string, ParameterInfo>();
  for (const [name, parameter] of Object.entries(spec.parameters ?? {})) {
    const type =
      parameter.type === 'int'
        ? INT
        : parameter.type === 'real'
          ? REAL
          : parameter.type === 'boolean'
            ? BOOLEAN
            : undefined;
    parameters.set(name, { name, index: parameters.size, spec: parameter, type });
  }
  return {
    spec,
    agents,
    agentList: [...agents.values()],
    spaces,
    spaceList: [...spaces.values()],
    parameters,
    parameterList: [...parameters.values()],
  };
}

/** The grid an agent type is the cells or an occupant of. */
export const gridOf = (agent: AgentInfo): SpaceInfo | undefined =>
  agent.role === 'cell' || agent.role === 'occupant' ? agent.space : undefined;

/** The continuous space an agent type lives in. */
export const continuousOf = (agent: AgentInfo): SpaceInfo | undefined =>
  agent.role === 'point' ? agent.space : undefined;

/** The grid or continuous space two agent types share, if any. */
export function sharedSpace(a: AgentInfo, b: AgentInfo): SpaceInfo | undefined {
  return a.space !== undefined && a.space === b.space ? a.space : undefined;
}

// ───────────────────────────────── Scopes ───────────────────────────────

/** A local variable or a selection's binding. */
export interface Variable {
  readonly name: string;
  readonly type: Type;
  /** Index into the frame's `refs` (agents) or `nums` (everything else). */
  readonly slot: number;
}

/**
 * What an expression context allows, shared by every scope nested in it. It
 * also counts the frame slots the context needs.
 */
export class ScopeRoot {
  nums = 0;
  refs = 0;

  constructor(
    /** How the context is named in messages, such as `stopWhen` or `the size of grid "land"`. */
    readonly label: string,
    /** The acting agent's type, if there is one. */
    readonly self: AgentInfo | undefined,
    readonly options: {
      /** Only literals, operators and parameters (space sizes, populations). */
      readonly constant?: boolean;
      /** Random operators are not allowed (styles). */
      readonly noRandom?: boolean;
      /** In an initial value: only attributes of self with a lower index may be read. */
      readonly attributeLimit?: number;
    } = {},
  ) {}
}

/** A lexical scope: the variables visible at one point of an action list or expression. */
export class Scope {
  readonly #vars = new Map<string, Variable>();

  constructor(
    readonly root: ScopeRoot,
    readonly parent?: Scope,
  ) {}

  /** A new scope inside this one. */
  child(): Scope {
    return new Scope(this.root, this);
  }

  find(name: string): Variable | undefined {
    return this.#vars.get(name) ?? this.parent?.find(name);
  }

  /** Every visible variable name, for suggestions. */
  names(): string[] {
    return [...this.#vars.keys(), ...(this.parent?.names() ?? [])];
  }

  /** Adds a variable, giving it the next free frame slot. */
  declare(name: string, type: Type): Variable {
    const slot = type.kind === 'agent' ? this.root.refs++ : this.root.nums++;
    const variable: Variable = { name, type, slot };
    this.#vars.set(name, variable);
    return variable;
  }
}

// ─────────────────────────────── References ─────────────────────────────

/** One step along a reference from an agent. */
export type Step =
  | { readonly kind: 'attribute'; readonly attribute: AttributeInfo }
  | { readonly kind: 'cell' }
  | { readonly kind: 'x' }
  | { readonly kind: 'y' }
  | { readonly kind: 'id' };

/** What a reference denotes. */
export type Resolved =
  | { readonly kind: 'tick'; readonly type: Type }
  | { readonly kind: 'param'; readonly parameter: ParameterInfo; readonly type: Type }
  | {
      readonly kind: 'spaceSize';
      readonly space: SpaceInfo;
      readonly dimension: 'width' | 'height';
      readonly type: Type;
    }
  /** A local variable that is not an agent. */
  | { readonly kind: 'local'; readonly variable: Variable; readonly type: Type }
  /**
   * A walk from the acting agent or an agent-valued variable. With no steps
   * it is that agent; the last step gives the type.
   */
  | {
      readonly kind: 'path';
      readonly base: Variable | 'self';
      /** The agent type of the base. */
      readonly baseAgent: AgentInfo;
      readonly steps: readonly Step[];
      /** The agent type each step starts from, parallel to `steps`. */
      readonly owners: readonly AgentInfo[];
      readonly type: Type;
    };

export type Resolution =
  | { readonly ok: true; readonly value: Resolved }
  | { readonly ok: false; readonly message: string };

const fail = (message: string): Resolution => ({ ok: false, message });

/** Resolves a dotted reference in a scope. */
export function resolveReference(info: ModelInfo, reference: string, scope: Scope): Resolution {
  const parts = reference.split('.');
  const head = parts[0] ?? '';
  const root = scope.root;

  if (root.options.constant && head !== 'param') {
    return fail(
      `${capitalize(root.label)} may use only literals, operators and parameters; found "${reference}"`,
    );
  }
  if (head === 'tick') {
    if (parts.length > 1) return fail(`"tick" is an int and has no "${parts[1]}"`);
    return { ok: true, value: { kind: 'tick', type: INT } };
  }
  if (head === 'param') {
    const name = parts[1];
    if (name === undefined) return fail('"param" must be followed by a parameter name');
    const parameter = info.parameters.get(name);
    if (!parameter) {
      return fail(`Unknown parameter "${name}"${suggest(name, info.parameters.keys())}`);
    }
    if (!parameter.type) {
      return fail(
        `Parameter "${name}" is a ${parameter.spec.type} parameter; expressions can use only int, real and boolean parameters`,
      );
    }
    if (parts.length > 2) return fail(`Parameter "${name}" has no "${parts[2]}"`);
    return { ok: true, value: { kind: 'param', parameter, type: parameter.type } };
  }
  if (head === 'space') {
    const name = parts[1];
    const dimension = parts[2];
    if (name === undefined || dimension === undefined || parts.length > 3) {
      return fail(`Write a space size as space.<name>.width or space.<name>.height`);
    }
    const space = info.spaces.get(name);
    if (!space) return fail(`Unknown space "${name}"${suggest(name, info.spaces.keys())}`);
    if (space.spec.kind === 'network') return fail(`Network "${name}" has no size`);
    if (dimension !== 'width' && dimension !== 'height') {
      return fail(`A space has a "width" and a "height", not "${dimension}"`);
    }
    return {
      ok: true,
      value: {
        kind: 'spaceSize',
        space,
        dimension,
        type: space.spec.kind === 'grid' ? INT : REAL,
      },
    };
  }

  const variable = scope.find(head);
  if (variable) {
    if (parts.length === 1) {
      if (variable.type.kind === 'agent') {
        const agent = info.agents.get(variable.type.agent);
        if (!agent) return fail(`Unknown agent type "${variable.type.agent}"`);
        return {
          ok: true,
          value: {
            kind: 'path',
            base: variable,
            baseAgent: agent,
            steps: [],
            owners: [],
            type: variable.type,
          },
        };
      }
      return { ok: true, value: { kind: 'local', variable, type: variable.type } };
    }
    if (variable.type.kind !== 'agent') {
      return fail(`"${head}" is ${typeName(variable.type)} and has no "${parts[1]}"`);
    }
    const agent = info.agents.get(variable.type.agent);
    if (!agent) return fail(`Unknown agent type "${variable.type.agent}"`);
    return walk(root, head, variable, agent, parts.slice(1));
  }

  if (!root.self) {
    const known = [...scope.names(), 'param', 'tick', 'space'];
    return fail(
      head === 'self'
        ? `There is no acting agent (self) in ${root.label}`
        : `Unknown name "${head}": ${root.label} has no acting agent, so a bare name must be a local variable or binding${suggest(head, known)}`,
    );
  }
  if (head === 'self') {
    if (parts.length === 1) {
      return {
        ok: true,
        value: {
          kind: 'path',
          base: 'self',
          baseAgent: root.self,
          steps: [],
          owners: [],
          type: agentType(root.self.name),
        },
      };
    }
    return walk(root, 'self', 'self', root.self, parts.slice(1));
  }
  return walk(root, 'self', 'self', root.self, parts, scope.names());
}

function walk(
  root: ScopeRoot,
  baseText: string,
  base: Variable | 'self',
  baseAgent: AgentInfo,
  parts: readonly string[],
  variables: readonly string[] = [],
): Resolution {
  const steps: Step[] = [];
  const owners: AgentInfo[] = [];
  let current: AgentInfo | undefined = baseAgent;
  let type: Type = agentType(baseAgent.name);
  let text = baseText;
  for (const part of parts) {
    if (!current) return fail(`"${text}" is ${typeName(type)} and has no "${part}"`);
    const agent: AgentInfo = current;
    owners.push(agent);
    if (part === 'cell') {
      const cellType = agent.role === 'occupant' ? agent.space?.cellType : undefined;
      if (!cellType) {
        return fail(
          `"${text}.cell" is only defined for occupants of a grid, and "${agent.name}" is not one`,
        );
      }
      steps.push({ kind: 'cell' });
      current = cellType;
      type = agentType(cellType.name);
    } else if (part === 'x' || part === 'y') {
      if (agent.role !== 'cell' && agent.role !== 'point') {
        return fail(
          `"${text}.${part}" is only defined for grid cells and agents in a continuous space; "${agent.name}" is ${agent.role === 'occupant' ? `an occupant: use ${text}.cell.${part}` : 'neither'}`,
        );
      }
      steps.push({ kind: part });
      current = undefined;
      type = agent.role === 'cell' ? INT : REAL;
    } else if (part === 'id') {
      steps.push({ kind: 'id' });
      current = undefined;
      type = INT;
    } else {
      const attribute = agent.attributes.get(part);
      if (!attribute) {
        const candidates = [...agent.attributes.keys(), 'id', ...variables];
        if (agent.role === 'occupant') candidates.push('cell');
        if (agent.role === 'cell' || agent.role === 'point') candidates.push('x', 'y');
        return fail(
          `Unknown attribute "${part}" of agent type "${agent.name}"${suggest(part, candidates)}`,
        );
      }
      const limit = root.options.attributeLimit;
      if (
        base === 'self' &&
        steps.length === 0 &&
        limit !== undefined &&
        attribute.index >= limit
      ) {
        return fail(
          `An initial value can read only attributes declared before it, and "${part}" is not`,
        );
      }
      steps.push({ kind: 'attribute', attribute });
      current = undefined;
      type = attribute.type;
    }
    text += `.${part}`;
  }
  return { ok: true, value: { kind: 'path', base, baseAgent, steps, owners, type } };
}

// ─────────────────────────────── Suggestions ────────────────────────────

function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]!;
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j]!;
      const cost = a[i - 1]?.toLowerCase() === b[j - 1]?.toLowerCase() ? 0 : 1;
      previous[j] = Math.min(above + 1, previous[j - 1]! + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return previous[b.length]!;
}

/** The closest of `candidates` to `name`, if any is close enough to be a likely typo. */
export function closest(name: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = editDistance(name, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  const tolerance = Math.max(2, Math.floor(name.length / 2));
  return best !== undefined && bestDistance <= tolerance ? best : undefined;
}

/** `; did you mean "x"?` for the closest candidate, or nothing. */
export function suggest(name: string, candidates: Iterable<string>): string {
  const found = closest(name, candidates);
  return found === undefined ? '' : `; did you mean "${found}"?`;
}

export const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
