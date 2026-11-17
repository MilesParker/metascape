// SPDX-License-Identifier: EPL-2.0
//
// The interpreter's index of a model in the Metascape model format (derived
// from the MetaABM metamodel; see ./types.ts): its agents, scapes, spaces and
// attributes, and which agents each space holds. Built once per model and
// shared by every run.
import type { Behaviour } from './flows';
import type { Datum, ValueType } from './functions';
import type { Act, ActId, Agent, Attribute, ExecutionSettings, Model, Scape, Space } from './types';

export interface AttributeInfo {
  readonly id: string;
  /** The attribute's reference: its owner's path, then its ID (its ID alone on the root scape). */
  readonly ref: string;
  /** Position in the owner's values. */
  readonly index: number;
  readonly decl: Attribute;
  readonly type: ValueType;
  /** The options of a state attribute. */
  readonly options: readonly string[] | undefined;
  /** The value an agent starts with. */
  readonly initial: Datum;
  readonly owner: OwnerInfo;
}

interface OwnerBase {
  readonly id: string;
  /** The path from the root scape, as references write it: `bug`, `region.farmer`; '' for the root scape. */
  readonly path: string;
  readonly label: string;
  readonly attributes: AttributeInfo[];
  readonly attribute: Map<string, AttributeInfo>;
}

/** An agent type, or a scape type (a scape is an agent too). */
export interface AgentInfo extends OwnerBase {
  readonly kind: 'agent' | 'scape';
  readonly decl: Agent | Scape | Model;
  /** The scape type that declares this agent; undefined for the model's root scape. */
  readonly context: ScapeInfo | undefined;
  /** Position among the model's agent types, for default colours. */
  readonly position: number;
  readonly execution: ExecutionSettings;
  /** The grids whose cells are agents of this type. */
  readonly fills: SpaceInfo[];
  /** The grid agents of this type stand on. */
  grid: SpaceInfo | undefined;
  /** The continuous space agents of this type are in. */
  continuous: SpaceInfo | undefined;
  /** The networks agents of this type are nodes of. */
  readonly networks: SpaceInfo[];
  /** The agent's own acts, compiled. */
  behaviour: Behaviour | undefined;
  /** The agent's styles, compiled. */
  readonly styles: Behaviour[];
}

export interface ScapeInfo extends AgentInfo {
  readonly kind: 'scape';
  readonly agents: AgentInfo[];
  readonly spaces: SpaceInfo[];
}

export interface SpaceInfo extends OwnerBase {
  readonly kind: 'space';
  readonly decl: Space;
  readonly context: ScapeInfo;
  /** For a grid: the agent type of its cells. */
  fill: AgentInfo | undefined;
  /** The agent types the space holds: a grid's occupants, a continuous space's or network's members. */
  readonly members: AgentInfo[];
}

export type OwnerInfo = AgentInfo | SpaceInfo;

export interface ModelIndex {
  readonly model: Model;
  readonly root: ScapeInfo;
  /** Every agent, scape and space, by path ('' for the root scape). */
  readonly owners: ReadonlyMap<string, OwnerInfo>;
  /** Every agent and scape type, the root first, in the order declared. */
  readonly agents: readonly AgentInfo[];
  /** The attribute a reference names. */
  attribute(ref: string): AttributeInfo;
  /** The options of a state attribute, from a `state:owner.attribute` type. */
  optionsOf(type: ValueType): readonly string[] | undefined;
}

/** A model the interpreter cannot run, with the reasons. */
export class UnsupportedModelError extends Error {
  constructor(readonly reasons: readonly string[]) {
    super(`This model uses what the interpreter does not support yet:\n- ${reasons.join('\n- ')}`);
    this.name = 'UnsupportedModelError';
  }
}

/**
 * A model whose method acts cannot be run as compiled: methods holding code
 * as text, which is not run unless `compileModel` is told to allow it (R21),
 * and methods whose implementation is to be provided but was not.
 */
export class MethodCodeError extends Error {
  constructor(
    /** Methods with a body, as `agent: act` (the root scape's as `act`). */
    readonly bodies: readonly string[],
    /** Methods marked as provided with no implementation given. */
    readonly missing: readonly string[] = [],
  ) {
    const lines: string[] = [];
    if (bodies.length > 0)
      lines.push(
        `This model holds code in its method acts, which is not run unless allowed: ${bodies.map((m) => `\`${m}\``).join(', ')}.`,
      );
    if (missing.length > 0)
      lines.push(
        `These methods are implemented outside the model, and no implementation was given: ${missing.map((m) => `\`${m}\``).join(', ')}.`,
      );
    super(lines.join('\n'));
    this.name = 'MethodCodeError';
  }
}

/** Every act of an agent or style, by its path (`step`, `moves.step`), depth first, in the order written. */
export function actsOf(
  acts: Record<ActId, Act> | undefined,
): [string, Exclude<Act, { kind: 'group' }>][] {
  const found: [string, Exclude<Act, { kind: 'group' }>][] = [];
  const visit = (members: Record<ActId, Act>, prefix: string) => {
    for (const [id, act] of Object.entries(members)) {
      if (act.kind === 'group') visit(act.members, `${prefix}${id}.`);
      else found.push([`${prefix}${id}`, act]);
    }
  };
  if (acts) visit(acts, '');
  return found;
}

const child = (path: string, id: string) => (path === '' ? id : `${path}.${id}`);

function initialValue(attribute: Attribute): Datum {
  if (attribute.type === 'state') {
    return attribute.defaultOption ?? Object.keys(attribute.options)[0] ?? '';
  }
  if (attribute.default !== undefined) return attribute.default;
  switch (attribute.type) {
    case 'boolean':
      return false;
    case 'symbol':
      return '';
    default:
      return 0;
  }
}

/** Indexes a checked model. Throws an {@link UnsupportedModelError} for what cannot run yet. */
export function indexModel(model: Model): ModelIndex {
  const owners = new Map<string, OwnerInfo>();
  const agents: AgentInfo[] = [];
  const unsupported: string[] = [];

  const attributesOf = (owner: OwnerInfo, decls: Record<string, Attribute> | undefined) => {
    for (const [id, decl] of Object.entries(decls ?? {})) {
      const ref = child(owner.path, id);
      const info: AttributeInfo = {
        id,
        ref,
        index: owner.attributes.length,
        decl,
        type: decl.type === 'state' ? `state:${ref}` : decl.type,
        options: decl.type === 'state' ? Object.keys(decl.options) : undefined,
        initial: initialValue(decl),
        owner,
      };
      owner.attributes.push(info);
      owner.attribute.set(id, info);
      if (decl.extensions?.length) unsupported.push(`extensions of attribute \`${ref}\``);
    }
  };

  const agentInfo = (
    decl: Agent | Scape | Model,
    kind: 'agent' | 'scape',
    id: string,
    path: string,
    context: ScapeInfo | undefined,
  ): AgentInfo => {
    const base = {
      kind,
      id,
      path,
      label: decl.label ?? id,
      decl,
      context,
      position: agents.length,
      execution: decl.execution ?? {},
      attributes: [],
      attribute: new Map<string, AttributeInfo>(),
      fills: [],
      grid: undefined,
      continuous: undefined,
      networks: [],
      behaviour: undefined,
      styles: [],
    };
    const info: AgentInfo =
      kind === 'scape' ? ({ ...base, kind: 'scape', agents: [], spaces: [] } as ScapeInfo) : base;
    owners.set(path, info);
    agents.push(info);
    attributesOf(info, decl.attributes);
    if (decl.extensions?.length) unsupported.push(`extensions of \`${id}\``);
    for (const [styleId, style] of Object.entries(decl.styles ?? {})) {
      if (style.kind === 'shape') unsupported.push(`shape style \`${styleId}\``);
    }
    return info;
  };

  const scapeInfo = (
    decl: Scape | Model,
    id: string,
    path: string,
    context: ScapeInfo | undefined,
  ) => {
    const info = agentInfo(decl, 'scape', id, path, context) as ScapeInfo;
    for (const [spaceId, space] of Object.entries(decl.spaces ?? {})) {
      const spaceInfo: SpaceInfo = {
        kind: 'space',
        id: spaceId,
        path: child(path, spaceId),
        label: space.label ?? spaceId,
        decl: space,
        context: info,
        attributes: [],
        attribute: new Map(),
        fill: undefined,
        members: [],
      };
      owners.set(spaceInfo.path, spaceInfo);
      attributesOf(spaceInfo, space.attributes);
      info.spaces.push(spaceInfo);
      if (space.kind === 'geography') unsupported.push(`geography \`${spaceId}\``);
      else if (space.kind !== 'network' && space.dimensions.length > 2) {
        unsupported.push(`space \`${spaceId}\`, which has more than two dimensions`);
      }
    }
    if (Object.keys(decl.valueLayers ?? {}).length > 0)
      unsupported.push(`value layers of \`${id}\``);
    for (const [agentId, agent] of Object.entries(decl.agents ?? {})) {
      info.agents.push(
        agent.kind === 'scape'
          ? scapeInfo(agent, agentId, child(path, agentId), info)
          : agentInfo(agent, 'agent', agentId, child(path, agentId), info),
      );
    }
    return info;
  };

  const root = scapeInfo(model, model.id, '', undefined);

  // Which agents each space holds comes from the builder acts (MetaABM's ABuildProjection).
  for (const scape of agents.filter((a): a is ScapeInfo => a.kind === 'scape')) {
    for (const [actId, act] of actsOf(scape.decl.acts)) {
      if (act.kind === 'load') unsupported.push(`loading agents (\`${actId}\`)`);
      if (act.kind === 'create' && act.shape !== undefined) {
        unsupported.push(`shaped agents (\`${actId}\`)`);
      }
      if (act.kind === 'buildGeography') unsupported.push(`building geographies (\`${actId}\`)`);
      if (act.kind !== 'buildGrid' && act.kind !== 'buildSpace' && act.kind !== 'buildNetwork') {
        continue;
      }
      const space = owners.get(act.space) as SpaceInfo;
      const members = (act.agents ?? []).map((agentId) => owners.get(agentId) as AgentInfo);
      for (const member of members) if (!space.members.includes(member)) space.members.push(member);
      if (act.kind === 'buildGrid' && act.fillAgent !== undefined) {
        const fill = owners.get(act.fillAgent) as AgentInfo;
        space.fill ??= fill;
        if (!fill.fills.includes(space)) fill.fills.push(space);
      }
    }
  }
  for (const agent of agents) {
    for (const [actId, act] of actsOf(agent.decl.acts)) {
      if (agent.kind !== 'scape' && act.kind.startsWith('build') && act.kind !== 'build') {
        unsupported.push(`\`${actId}\` of agent \`${agent.id}\`: only scapes build spaces`);
      }
    }
  }
  for (const space of owners.values()) {
    if (space.kind !== 'space') continue;
    for (const member of space.members) {
      if (space.decl.kind === 'grid') {
        if (member.grid && member.grid !== space) {
          unsupported.push(`\`${member.id}\` standing on two grids`);
        }
        if (member === space.fill) {
          unsupported.push(`\`${member.id}\` as both the cells of \`${space.id}\` and an occupant`);
        }
        member.grid = space;
      } else if (space.decl.kind === 'continuous') {
        if (member.continuous && member.continuous !== space) {
          unsupported.push(`\`${member.id}\` in two continuous spaces`);
        }
        member.continuous = space;
      } else if (space.decl.kind === 'network') {
        member.networks.push(space);
      }
    }
  }
  for (const agent of agents) {
    if (agent.grid && agent.continuous) {
      unsupported.push(`\`${agent.id}\` in both a grid and a continuous space`);
    }
    if (agent.fills.length > 0 && (agent.grid || agent.continuous)) {
      unsupported.push(`\`${agent.id}\` as both grid cells and an agent placed in a space`);
    }
    if (agent.fills.length > 0 && agent.kind === 'scape') {
      unsupported.push(`scape \`${agent.id}\` as the cells of a grid`);
    }
  }
  if (unsupported.length > 0) throw new UnsupportedModelError([...new Set(unsupported)]);

  const attribute = (ref: string): AttributeInfo => {
    const dot = ref.lastIndexOf('.');
    const owner = owners.get(dot < 0 ? '' : ref.slice(0, dot));
    const found = owner?.attribute.get(ref.slice(dot + 1));
    if (!found) throw new Error(`Internal error: no attribute \`${ref}\``);
    return found;
  };
  return {
    model,
    root,
    owners,
    agents,
    attribute,
    optionsOf: (type) =>
      type.startsWith('state:') ? attribute(type.slice('state:'.length)).options : undefined,
  };
}
