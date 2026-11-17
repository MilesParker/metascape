// SPDX-License-Identifier: EPL-2.0
//
// The checker for the Metascape model format, which is derived from the
// MetaABM metamodel (see ./types.ts for its provenance).
import { coreLibrary } from './core-library';
import { formatPath, ModelFormatError, parseLibrary, parseModel } from './schema';
import {
  ROOT_ACT_KINDS,
  type Act,
  type ActId,
  type ActRef,
  type AgentRef,
  type Constant,
  type Agent,
  type Attribute,
  type AttributeRef,
  type Diagnostic,
  type Extension,
  type Input,
  type Library,
  type LibraryFunction,
  type Model,
  type Prototype,
  type PrototypeType,
  type RootAct,
  type Scape,
  type SelectLikeAct,
  type Space,
  type SpaceRef,
  type Value,
} from './types';

/**
 * Checks the meaning of a model: that every reference resolves, flows are
 * acyclic and start at a root act, sinks fit their functions, and selections
 * are well formed. Input that does not fit the format's structure gets the
 * diagnostics of {@link parseModel} instead.
 *
 * @param library the function library sinks refer to. Default: the core library.
 * @returns the problems found, each with the path of the offending part; empty
 * if the model is valid and nothing is worth a warning.
 */
export function checkModel(model: Model, library: Library = coreLibrary): Diagnostic[] {
  try {
    parseModel(model);
  } catch (error) {
    if (error instanceof ModelFormatError) return [...error.diagnostics];
    throw error;
  }
  return new Checker(model, indexLibrary(library)).run();
}

/** Throws a {@link ModelFormatError} listing every error {@link checkModel} finds. */
export function assertValidModel(model: Model, library: Library = coreLibrary): void {
  const errors = checkModel(model, library).filter((d) => d.severity === 'error');
  if (errors.length > 0) throw new ModelFormatError(errors);
}

/**
 * Checks a function library: its structure, that function and constant IDs
 * are unique across the whole library (models refer to them by ID alone), and
 * that optional inputs come last.
 */
export function checkLibrary(library: Library): Diagnostic[] {
  try {
    parseLibrary(library);
  } catch (error) {
    if (error instanceof ModelFormatError) return [...error.diagnostics];
    throw error;
  }
  return indexLibrary(library).diagnostics;
}

// ───────────────────────────── Library ─────────────────────────────

interface FunctionInfo {
  id: string;
  fn: LibraryFunction;
  /** The IDs of the libraries the function is in, outermost first. */
  libraries: string[];
}

interface LibraryIndex {
  functions: Map<string, FunctionInfo>;
  constants: Map<string, Constant>;
  diagnostics: Diagnostic[];
}

function indexLibrary(library: Library): LibraryIndex {
  const functions = new Map<string, FunctionInfo>();
  const constants = new Map<string, Constant>();
  const paths = new Map<string, string>();
  const constantPaths = new Map<string, string>();
  const diagnostics: Diagnostic[] = [];
  const visit = (lib: Library, libraries: string[], path: PropertyKey[]) => {
    for (const [id, constant] of Object.entries(lib.constants ?? {})) {
      const at = formatPath([...path, 'constants', id]);
      const earlier = constantPaths.get(id);
      if (earlier !== undefined) {
        diagnostics.push(
          error(
            at,
            `Constant ID \`${id}\` is already used at ${earlier}. Constant IDs are unique across the library.`,
          ),
        );
        continue;
      }
      constantPaths.set(id, at);
      constants.set(id, constant);
      const found = literalType(constant.value);
      if (!fits(found, constant.type) || (constant.type === 'integer' && found !== 'integer')) {
        diagnostics.push(
          error(
            `${at}.value`,
            `The value must be ${describeType(constant.type)}; found ${JSON.stringify(constant.value)}.`,
          ),
        );
      }
    }
    for (const [id, fn] of Object.entries(lib.functions ?? {})) {
      const at = formatPath([...path, 'functions', id]);
      const earlier = paths.get(id);
      if (earlier !== undefined) {
        diagnostics.push(
          error(
            at,
            `Function ID \`${id}\` is already used at ${earlier}. Function IDs are unique across the library.`,
          ),
        );
        continue;
      }
      paths.set(id, at);
      functions.set(id, { id, fn, libraries });
      let optionalSeen = false;
      for (const [inputId, input] of Object.entries(fn.inputs ?? {})) {
        if (input.optional) optionalSeen = true;
        else if (optionalSeen) {
          diagnostics.push(
            error(
              formatPath([...path, 'functions', id, 'inputs', inputId]),
              'A required input follows an optional one. Optional inputs come last.',
            ),
          );
        }
      }
    }
    for (const [id, sub] of Object.entries(lib.subs ?? {})) {
      visit(sub, [...libraries, id], [...path, 'subs', id]);
    }
  };
  visit(library, [], []);
  return { functions, constants, diagnostics };
}

/** The query functions that set a selection's cardinality. */
const CARDINALITY_FUNCTIONS = new Set(['all', 'nearest', 'minimize', 'maximize']);
/** Spatial query functions that do not need the selection to name a space. */
const SPACELESS_SPATIAL_FUNCTIONS = new Set(['all', 'minimize', 'maximize']);

const isLogicalFunction = (fn: LibraryFunction) =>
  fn.kind === 'logicalOperator' || fn.kind === 'genericLogical';

/** Whether a function is in the library of spatial functions, which are query terms. */
const isSpatial = (info: FunctionInfo) => info.libraries.includes('spatial');

// ────────────────────────────── Types ──────────────────────────────

/**
 * The type of a value: an attribute type, `numeric` or `generic` as for
 * prototypes, `state:owner.attribute` for the options of a state attribute, or
 * `none` for a function without a result.
 */
type ValueType = PrototypeType | `state:${string}` | 'none';

const isNumericType = (type: ValueType) =>
  type === 'integer' || type === 'real' || type === 'numeric';

/** Whether a value of one type fits where another is expected. */
function fits(value: ValueType, expected: ValueType): boolean {
  if (value === 'none') return false;
  if (value === 'generic' || expected === 'generic') return true;
  switch (expected) {
    case 'numeric':
    case 'real':
      return isNumericType(value);
    case 'integer':
      return value === 'integer' || value === 'numeric';
    default:
      return value === expected;
  }
}

/**
 * The type of a combination of values, as MetaABM's generators work out an
 * operator's result (`types.ext`, `resultType`): symbol if any is a symbol;
 * boolean if all are booleans; real if any is real; integer if all are
 * integers; otherwise numeric. Values of one state keep that state.
 */
function combine(types: readonly ValueType[]): ValueType {
  const first = types[0];
  if (first?.startsWith('state:') && types.every((t) => t === first)) return first;
  if (types.includes('symbol')) return 'symbol';
  if (types.includes('boolean')) return types.every((t) => t === 'boolean') ? 'boolean' : 'generic';
  if (types.includes('real')) return 'real';
  if (types.length > 0 && types.every((t) => t === 'integer')) return 'integer';
  return 'numeric';
}

function describeType(type: ValueType): string {
  if (type.startsWith('state:')) return `an option of \`${type.slice('state:'.length)}\``;
  switch (type) {
    case 'none':
      return 'no value';
    case 'generic':
      return 'any value';
    case 'integer':
      return 'an integer';
    case 'numeric':
      return 'a number';
    case 'real':
      return 'a real number';
    default:
      return `a ${type}`;
  }
}

function literalType(literal: boolean | number | string): ValueType {
  if (typeof literal === 'boolean') return 'boolean';
  if (typeof literal === 'string') return 'symbol';
  return Number.isInteger(literal) ? 'integer' : 'real';
}

// ───────────────────────────── Checker ─────────────────────────────

type Path = readonly PropertyKey[];

function error(path: string, message: string): Diagnostic {
  return { path, severity: 'error', message };
}

/** An agent, scape or space: something that owns attributes. */
interface Owner {
  kind: 'agent' | 'scape' | 'space';
  /** Its path from the root scape, as references write it: `region.farmer`; empty for the root. */
  ref: string;
  path: Path;
  attributes: Record<string, Attribute>;
  space?: Space;
}

/** An agent or style, whose acts refer to each other by their paths within it. */
interface Actable {
  /** For messages: "agent `bug`" or "style `bugStyle2D`". */
  name: string;
  acts: Record<ActId, Act>;
  path: Path;
}

interface ActInfo {
  /** The act's path within its agent or style: `bugRule`, `moves.step`. */
  id: ActRef;
  act: Exclude<Act, { kind: 'group' }>;
  path: Path;
}

const ROOT_KINDS: ReadonlySet<string> = new Set(ROOT_ACT_KINDS);
const SELECT_KINDS: ReadonlySet<string> = new Set([...ROOT_ACT_KINDS, 'select', 'create', 'load']);
const LOGIC_KINDS: ReadonlySet<string> = new Set(['all', 'any', 'none']);

const isRoot = (act: Act): act is RootAct => ROOT_KINDS.has(act.kind);
const isSelectLike = (act: Act): act is SelectLikeAct => SELECT_KINDS.has(act.kind);

class Checker {
  private readonly diagnostics: Diagnostic[] = [];
  readonly owners = new Map<string, Owner>();
  private readonly actables: Actable[] = [];
  readonly functions: ReadonlyMap<string, FunctionInfo>;
  readonly constants: ReadonlyMap<string, Constant>;

  constructor(
    private readonly model: Model,
    library: LibraryIndex,
  ) {
    this.functions = library.functions;
    this.constants = library.constants;
  }

  run(): Diagnostic[] {
    this.collectScape(this.model, '', `scape \`${this.model.id}\``, []);
    for (const actable of this.actables) new ActChecker(this, actable).run();
    return this.diagnostics;
  }

  error(path: Path, message: string): void {
    this.diagnostics.push({ path: formatPath(path), severity: 'error', message });
  }

  warn(path: Path, message: string): void {
    this.diagnostics.push({ path: formatPath(path), severity: 'warning', message });
  }

  // ─────────────────────────── Structure ───────────────────────────

  /** Adds an owner. Siblings with the same ID are reported by {@link uniqueAmongSiblings}; the first is kept. */
  private addOwner(owner: Owner): void {
    if (!this.owners.has(owner.ref)) this.owners.set(owner.ref, owner);
  }

  private collectScape(scape: Model | Scape, ref: string, name: string, path: Path): void {
    this.collectAgent(scape, 'scape', ref, name, path);
    this.uniqueAmongSiblings(path, {
      attributes: scape.attributes,
      agents: scape.agents,
      spaces: scape.spaces,
      valueLayers: scape.valueLayers,
      styles: scape.styles,
    });
    for (const [spaceId, space] of Object.entries(scape.spaces ?? {})) {
      const spacePath = [...path, 'spaces', spaceId];
      this.addOwner({
        kind: 'space',
        ref: childRef(ref, spaceId),
        path: spacePath,
        attributes: space.attributes ?? {},
        space,
      });
      this.checkAttributes(space.attributes, spacePath);
      this.checkSpace(space, spacePath);
    }
    for (const layerId of Object.keys(scape.valueLayers ?? {})) {
      this.warn([...path, 'valueLayers', layerId], 'Value layers are not supported yet.');
    }
    for (const [agentId, agent] of Object.entries(scape.agents ?? {})) {
      const agentPath = [...path, 'agents', agentId];
      const agentRef = childRef(ref, agentId);
      const agentName = `${agent.kind} \`${agentRef}\``;
      if (agent.kind === 'scape') this.collectScape(agent, agentRef, agentName, agentPath);
      else this.collectAgent(agent, 'agent', agentRef, agentName, agentPath);
    }
  }

  private collectAgent(
    agent: Model | Scape | Agent,
    kind: 'agent' | 'scape',
    ref: string,
    name: string,
    path: Path,
  ): void {
    this.addOwner({ kind, ref, path, attributes: agent.attributes ?? {} });
    if (kind === 'agent') {
      this.uniqueAmongSiblings(path, { attributes: agent.attributes, styles: agent.styles });
    }
    this.checkAttributes(agent.attributes, path);
    this.checkExtensions(agent.extensions, path);
    this.checkExecution(agent, path);
    if (agent.acts) {
      this.actables.push({ name, acts: agent.acts, path: [...path, 'acts'] });
    }
    for (const [styleId, style] of Object.entries(agent.styles ?? {})) {
      const stylePath = [...path, 'styles', styleId];
      if (style.kind === 'shape') this.warn(stylePath, 'Shape styles are not supported yet.');
      if (style.acts) {
        this.actables.push({
          name: `style \`${styleId}\` of ${name}`,
          acts: style.acts,
          path: [...stylePath, 'acts'],
        });
      }
    }
  }

  /** R14: the rules named by an agent's execution settings are its own rule, schedule or diffuse acts, each once. */
  private checkExecution(agent: Model | Scape | Agent, path: Path): void {
    const rules = agent.execution?.rules;
    if (!rules) return;
    const kinds = new Map<string, string>();
    const visit = (members: Record<ActId, Act>, prefix: string) => {
      for (const [actId, act] of Object.entries(members)) {
        if (act.kind === 'group') visit(act.members, `${prefix}${actId}.`);
        else kinds.set(`${prefix}${actId}`, act.kind);
      }
    };
    if (agent.acts) visit(agent.acts, '');
    const seen = new Set<string>();
    rules.forEach((actId, index) => {
      const at = [...path, 'execution', 'rules', index];
      const kind = kinds.get(actId);
      if (kind === undefined) {
        const owner = 'kind' in agent && agent.kind === 'agent' ? 'agent' : 'scape';
        this.error(at, `\`${actId}\` is not an act of this ${owner}.`);
      } else if (kind !== 'rule' && kind !== 'schedule' && kind !== 'diffuse') {
        this.error(
          at,
          `\`${actId}\` is not a rule, schedule or diffuse act, which are what run each period.`,
        );
      } else if (seen.has(actId)) {
        this.error(at, `\`${actId}\` is listed twice.`);
      }
      seen.add(actId);
    });
  }

  /** R1: the IDs of an element's children are unique, across all the records that hold them. */
  private uniqueAmongSiblings(path: Path, records: Record<string, object | undefined>): void {
    const seen = new Map<string, string>();
    for (const [field, record] of Object.entries(records)) {
      for (const childId of Object.keys(record ?? {})) {
        const earlier = seen.get(childId);
        if (earlier !== undefined) {
          this.error(
            [...path, field, childId],
            `\`${childId}\` is already the ID of one of this element's ${earlier}. IDs are unique among siblings.`,
          );
        } else {
          seen.set(childId, field);
        }
      }
    }
  }

  private checkExtensions(extensions: readonly Extension[] | undefined, path: Path): void {
    extensions?.forEach((extension, index) =>
      this.warn(
        [...path, 'extensions', index],
        `Extensions (here \`${extension.kind}\`) are not supported yet.`,
      ),
    );
  }

  private checkAttributes(attributes: Record<string, Attribute> | undefined, path: Path): void {
    for (const [attributeId, attribute] of Object.entries(attributes ?? {})) {
      const at = [...path, 'attributes', attributeId];
      this.checkExtensions(attribute.extensions, at);
      if (attribute.type === 'state') {
        if (
          attribute.defaultOption !== undefined &&
          !Object.hasOwn(attribute.options, attribute.defaultOption)
        ) {
          this.error(
            [...at, 'defaultOption'],
            `\`${attribute.defaultOption}\` is not an option of this attribute. Its options are ${list(Object.keys(attribute.options))}.`,
          );
        }
        continue;
      }
      const numeric = attribute.type === 'integer' || attribute.type === 'real';
      if (attribute.default !== undefined) {
        const found = literalType(attribute.default);
        if (!fits(found, attribute.type) || (attribute.type === 'integer' && found !== 'integer')) {
          this.error(
            [...at, 'default'],
            `The default must be ${describeType(attribute.type)}; found ${JSON.stringify(attribute.default)}.`,
          );
        }
      }
      for (const bound of ['min', 'max'] as const) {
        const limit = attribute[bound];
        if (limit === undefined) continue;
        if (!numeric) {
          this.error([...at, bound], `Only integer and real attributes have a \`${bound}\`.`);
        } else if (attribute.type === 'integer' && !Number.isInteger(limit)) {
          this.error(
            [...at, bound],
            `The \`${bound}\` of an integer attribute must be an integer.`,
          );
        }
      }
      if (!numeric) continue;
      const { min, max } = attribute;
      if (min !== undefined && max !== undefined && min > max) {
        this.error([...at, 'max'], `\`max\` (${max}) is less than \`min\` (${min}).`);
      }
      if (typeof attribute.default === 'number') {
        if (min !== undefined && attribute.default < min) {
          this.error(
            [...at, 'default'],
            `The default (${attribute.default}) is less than \`min\` (${min}).`,
          );
        }
        if (max !== undefined && attribute.default > max) {
          this.error(
            [...at, 'default'],
            `The default (${attribute.default}) is more than \`max\` (${max}).`,
          );
        }
      }
    }
  }

  private checkSpace(space: Space, path: Path): void {
    if (space.kind === 'geography') {
      this.warn(path, 'Geography spaces are not supported yet.');
      return;
    }
    if (space.kind === 'network') return;
    const attributes = space.attributes ?? {};
    const seen = new Set<string>();
    space.dimensions.forEach((dimension, index) => {
      const at = [...path, 'dimensions', index];
      if (seen.has(dimension)) {
        this.error(at, `\`${dimension}\` is listed twice.`);
        return;
      }
      seen.add(dimension);
      const attribute = attributes[dimension];
      if (!attribute) {
        this.error(
          at,
          `\`${dimension}\` is not an attribute of this space. A dimension names one of the space's own attributes${suggestion(dimension, Object.keys(attributes))}.`,
        );
      } else if (
        space.kind === 'grid'
          ? attribute.type !== 'integer'
          : !isNumericType(attribute.type as ValueType)
      ) {
        this.error(
          at,
          `The size \`${dimension}\` must be ${space.kind === 'grid' ? 'an integer' : 'an integer or a real'}; it is ${describeAttributeType(attribute)}.`,
        );
      }
    });
  }

  // ─────────────────────────── Resolution ───────────────────────────

  /** The attribute a reference names, without reporting anything. */
  findAttribute(ref: AttributeRef): { owner: Owner; attribute: Attribute } | undefined {
    const [ownerRef, attributeId] = splitLast(ref);
    const owner = this.owners.get(ownerRef);
    const attribute = owner?.attributes[attributeId];
    return owner && attribute ? { owner, attribute } : undefined;
  }

  /** Resolves an attribute reference, reporting at `path` if it does not resolve. */
  resolveAttribute(
    ref: AttributeRef,
    path: Path,
  ): { owner: Owner; attribute: Attribute } | undefined {
    const [ownerRef, attributeId] = splitLast(ref);
    const owner = this.owners.get(ownerRef);
    if (!owner) {
      this.error(
        path,
        `\`${ownerRef}\` is not an agent, scape or space of this model${suggestion(ownerRef, this.ownerRefs())}. An attribute is written as the path of its owner from the root scape, then its ID.`,
      );
      return undefined;
    }
    const attribute = owner.attributes[attributeId];
    if (!attribute) {
      this.error(
        path,
        `${capitalize(describeOwner(owner))} has no attribute \`${attributeId}\`${suggestion(attributeId, Object.keys(owner.attributes))}.`,
      );
      return undefined;
    }
    return { owner, attribute };
  }

  /** Resolves the path of an agent or scape. */
  resolveAgent(ref: AgentRef, path: Path): Owner | undefined {
    const owner = ref === '' ? undefined : this.owners.get(ref);
    if (owner && owner.kind !== 'space') return owner;
    this.error(
      path,
      owner
        ? `\`${ref}\` is a space; an agent or scape is expected here.`
        : `\`${ref}\` is not an agent or scape of this model${suggestion(ref, this.ownerRefs('agent', 'scape'))}. Agents are written as their path from the root scape.`,
    );
    return undefined;
  }

  /** Resolves the path of a space, of one of the given kinds if any are given. */
  resolveSpace(ref: SpaceRef, path: Path, ...kinds: Space['kind'][]): Space | undefined {
    const owner = this.owners.get(ref);
    if (!owner?.space) {
      this.error(
        path,
        owner && ref !== ''
          ? `\`${ref}\` is ${owner.kind === 'agent' ? 'an agent' : 'a scape'}; a space is expected here.`
          : `\`${ref}\` is not a space of this model${suggestion(ref, this.ownerRefs('space'))}. Spaces are written as their path from the root scape.`,
      );
      return undefined;
    }
    if (kinds.length > 0 && !kinds.includes(owner.space.kind)) {
      this.error(
        path,
        `\`${ref}\` is a ${owner.space.kind} space; ${kinds.map((k) => `a ${k} space`).join(' or ')} is expected here.`,
      );
      return undefined;
    }
    return owner.space;
  }

  private ownerRefs(...kinds: Owner['kind'][]): string[] {
    return [...this.owners.values()]
      .filter((o) => o.ref !== '' && (kinds.length === 0 || kinds.includes(o.kind)))
      .map((o) => o.ref);
  }

  resolveFunction(id: string, path: Path): FunctionInfo | undefined {
    const info = this.functions.get(id);
    if (!info) {
      this.error(
        path,
        `\`${id}\` is not a function of the library${suggestion(id, [...this.functions.keys()])}.`,
      );
    }
    return info;
  }

  resolveConstant(id: string, path: Path): Constant | undefined {
    const constant = this.constants.get(id);
    if (!constant) {
      this.error(
        path,
        `\`${id}\` is not a constant of the library${suggestion(id, [...this.constants.keys()])}.`,
      );
    }
    return constant;
  }

  /** The type of an attribute's values. */
  attributeType(ref: AttributeRef, attribute: Attribute): ValueType {
    return attribute.type === 'state' ? `state:${ref}` : attribute.type;
  }
}

/** Checks the acts of one agent or style. */
class ActChecker {
  /** The acts, by their paths within the agent or style. */
  private readonly acts = new Map<ActRef, ActInfo>();
  private readonly groups = new Set<ActRef>();
  private readonly sources = new Map<ActRef, ActRef[]>();
  private readonly upstreamCache = new Map<ActRef, ReadonlySet<ActRef>>();
  private readonly resultTypes = new Map<ActRef, ValueType>();
  private readonly computing = new Set<ActRef>();
  /** The acts some root act's flow reaches. */
  private readonly reached = new Set<ActRef>();

  constructor(
    private readonly checker: Checker,
    private readonly actable: Actable,
  ) {}

  run(): void {
    this.collect(this.actable.acts, '', this.actable.path);
    for (const info of this.acts.values()) this.checkReferences(info);
    this.checkAcyclic();
    this.checkReachable();
    for (const info of this.acts.values()) this.checkFlow(info);
    this.checkSelections();
  }

  private collect(members: Record<ActId, Act>, prefix: string, path: Path): void {
    for (const [key, act] of Object.entries(members)) {
      const at = [...path, key];
      const id = childRef(prefix, key);
      if (act.kind === 'group') {
        this.groups.add(id);
        this.collect(act.members, id, [...at, 'members']);
        continue;
      }
      this.acts.set(id, { id, act, path: at });
      this.sources.set(id, this.sources.get(id) ?? []);
      for (const target of act.targets ?? []) {
        this.sources.set(target, [...(this.sources.get(target) ?? []), id]);
      }
    }
  }

  // ─────────────────────────── References ───────────────────────────

  /** Resolves an act ID within this agent or style, reporting at `path` if it does not resolve. */
  private resolveAct(id: ActId, path: Path): ActInfo | undefined {
    const info = this.acts.get(id);
    if (!info) {
      this.checker.error(
        path,
        `\`${id}\` is not an act of ${this.actable.name}${suggestion(id, [...this.acts.keys()])}. Acts refer to acts of the same agent or style, by their path within it.`,
      );
    }
    return info;
  }

  /** Resolves an act ID that must name a select, create or root act. */
  private resolveSelection(id: ActId, path: Path): ActInfo | undefined {
    const info = this.resolveAct(id, path);
    if (info && !isSelectLike(info.act)) {
      this.checker.error(
        path,
        `\`${id}\` is a ${info.act.kind} act; a select, create or root act is expected here.`,
      );
      return undefined;
    }
    return info;
  }

  private checkReferences({ id, act, path }: ActInfo): void {
    const checker = this.checker;
    act.targets?.forEach((target, index) => {
      const at = [...path, 'targets', index];
      if (this.acts.has(target)) {
        const targetAct = this.acts.get(target)!.act;
        if (isRoot(targetAct)) {
          checker.error(
            at,
            `\`${target}\` is a ${targetAct.kind} act, which starts its own flow; nothing flows into a root act.`,
          );
        }
      } else if (this.groups.has(target)) {
        checker.error(at, `\`${target}\` is a group; a flow goes to acts, not groups.`);
      } else {
        this.resolveAct(target, at);
      }
      if (target === id) checker.error(at, 'An act cannot target itself. Flows are acyclic.');
    });
    if ('selected' in act && act.selected !== undefined) {
      this.resolveSelection(act.selected, [...path, 'selected']);
    }
    switch (act.kind) {
      case 'rule':
      case 'schedule':
      case 'build':
      case 'initialize':
      case 'perform':
        if (act.space !== undefined) checker.resolveSpace(act.space, [...path, 'space']);
        break;
      case 'watch':
      case 'derive':
        if (act.space !== undefined) checker.resolveSpace(act.space, [...path, 'space']);
        checker.resolveAttribute(act.attribute, [...path, 'attribute']);
        break;
      case 'diffuse':
        if (act.space !== undefined) checker.resolveSpace(act.space, [...path, 'space']);
        for (const field of ['diffused', 'diffusionRate', 'evaporationRate'] as const) {
          const ref = act[field];
          if (ref === undefined) continue;
          const resolved = checker.resolveAttribute(ref, [...path, field]);
          if (resolved && !isNumericType(checker.attributeType(ref, resolved.attribute))) {
            checker.error(
              [...path, field],
              `\`${ref}\` must be an integer or real attribute; it is ${describeAttributeType(resolved.attribute)}.`,
            );
          }
        }
        break;
      case 'select':
        if (act.agent !== undefined) checker.resolveAgent(act.agent, [...path, 'agent']);
        if (act.space !== undefined) checker.resolveSpace(act.space, [...path, 'space']);
        break;
      case 'create':
      case 'load':
        checker.resolveAgent(act.agent, [...path, 'agent']);
        if (act.space !== undefined) checker.resolveSpace(act.space, [...path, 'space']);
        if (act.agentCount !== undefined) {
          this.checkValue(act.agentCount, [...path, 'agentCount'], 'numeric', 'The count');
        }
        if (act.kind === 'load') checker.warn(path, 'Loading agents is not supported yet.');
        else if (act.shape !== undefined)
          checker.warn([...path, 'shape'], 'Shaped agents are not supported yet.');
        break;
      case 'query':
      case 'evaluate':
        this.checkSink(act, path);
        break;
      case 'set': {
        const resolved = checker.resolveAttribute(act.attribute, [...path, 'attribute']);
        const expected = resolved
          ? checker.attributeType(act.attribute, resolved.attribute)
          : 'generic';
        this.checkValue(act.parameter, [...path, 'parameter'], expected, `\`${act.attribute}\``);
        break;
      }
      case 'move':
        this.resolveSelection(act.destination, [...path, 'destination']);
        break;
      case 'connect':
      case 'replace':
        this.resolveSelection(act.destination, [...path, 'destination']);
        checker.resolveSpace(act.within, [...path, 'within'], 'network');
        break;
      case 'disconnect':
        checker.resolveSpace(act.within, [...path, 'within'], 'network');
        break;
      case 'cause': {
        const result = this.resolveAct(act.result, [...path, 'result']);
        if (result && !isRoot(result.act)) {
          checker.error(
            [...path, 'result'],
            `\`${act.result}\` is a ${result.act.kind} act; a cause runs a root act.`,
          );
        }
        break;
      }
      case 'buildGrid':
      case 'buildSpace':
      case 'buildNetwork':
      case 'buildGeography': {
        const kind = (
          {
            buildGrid: 'grid',
            buildSpace: 'continuous',
            buildNetwork: 'network',
            buildGeography: 'geography',
          } as const
        )[act.kind];
        checker.resolveSpace(act.space, [...path, 'space'], kind);
        act.agents?.forEach((agentId, index) =>
          checker.resolveAgent(agentId, [...path, 'agents', index]),
        );
        act.attributes?.forEach((ref, index) =>
          checker.resolveAttribute(ref, [...path, 'attributes', index]),
        );
        if (act.kind === 'buildGrid' && act.fillAgent !== undefined) {
          checker.resolveAgent(act.fillAgent, [...path, 'fillAgent']);
        }
        if (act.kind === 'buildGeography')
          checker.warn(path, 'Building geographies is not supported yet.');
        break;
      }
      case 'method':
      case 'leave':
      case 'die':
      case 'all':
      case 'any':
      case 'none':
        break;
    }
  }

  // ───────────────────────────── Sinks ─────────────────────────────

  private checkSink(act: Extract<Act, { kind: 'query' | 'evaluate' }>, path: Path): void {
    const checker = this.checker;
    const info = checker.resolveFunction(act.function, [...path, 'function']);
    if (!info) return;
    const { fn } = info;
    if (act.kind === 'query' && !isLogicalFunction(fn)) {
      checker.error(
        [...path, 'function'],
        `\`${act.function}\` is not a logical function, so it cannot be a query; use an evaluate for its value.`,
      );
    }
    if (act.kind === 'evaluate' && isSpatial(info) && isLogicalFunction(fn)) {
      checker.error(
        [...path, 'function'],
        `\`${act.function}\` is a spatial query term; use it in a query, not an evaluate.`,
      );
    }
    const prototypes = Object.entries(fn.inputs ?? {});
    const inputs = act.inputs ?? [];
    const required = prototypes.filter(([, p]) => !p.optional).length;
    if (inputs.length < required || inputs.length > prototypes.length) {
      const count =
        required === prototypes.length ? `${required}` : `${required} to ${prototypes.length}`;
      const names =
        prototypes.length > 0 ? ` (${prototypes.map(([inputId]) => inputId).join(', ')})` : '';
      checker.error(
        [...path, 'inputs'],
        `\`${act.function}\` takes ${count} input${prototypes.length === 1 ? '' : 's'}${names}; this ${act.kind} has ${inputs.length}.`,
      );
    }
    inputs.forEach((input, index) => {
      const at = [...path, 'inputs', index];
      const entry = prototypes[index];
      if (!entry) {
        this.checkInputReferences(input, at);
        return;
      }
      this.checkInput(input, entry, at, act.function);
    });
  }

  private checkInputReferences(input: Input, path: Path): void {
    if ('multiValue' in input) {
      input.multiValue.forEach((ref, index) =>
        this.checker.resolveAttribute(ref, [...path, 'multiValue', index]),
      );
    } else {
      this.checkValue(input, path, 'generic', '');
    }
  }

  private checkInput(
    input: Input,
    [prototypeId, prototype]: [string, Prototype],
    path: Path,
    functionId: string,
  ): void {
    const name = `Input \`${prototypeId}\` of \`${functionId}\``;
    if ('multiValue' in input) {
      if (!prototype.multiple) {
        this.checker.error(path, `${name} takes a single value, not a multi-value.`);
      }
      input.multiValue.forEach((ref, index) => {
        const at = [...path, 'multiValue', index];
        const resolved = this.checker.resolveAttribute(ref, at);
        if (!resolved || !prototype.multiple) return;
        const type = this.checker.attributeType(ref, resolved.attribute);
        if (!fits(type, prototype.type)) {
          this.checker.error(
            at,
            `${name} lists attributes holding ${describeType(prototype.type)}; \`${ref}\` holds ${describeType(type)}.`,
          );
        }
      });
      return;
    }
    if (prototype.multiple) {
      this.checker.error(path, `${name} takes a multi-value: a list of attributes.`);
      this.checkValue(input, path, 'generic', name);
      return;
    }
    this.checkValue(input, path, prototype.type, name);
  }

  // ───────────────────────────── Values ─────────────────────────────

  /**
   * Resolves the references of a value and checks that its type fits
   * `expected`. `subject` names the place the value goes, for messages.
   */
  private checkValue(value: Value, path: Path, expected: ValueType, subject: string): void {
    const type = this.valueType(value, path, true);
    if ('attribute' in value && value.selected !== undefined) {
      this.resolveSelection(value.selected, [...path, 'selected']);
    }
    if (type === undefined || fits(type, expected)) return;
    this.checker.error(
      path,
      `${subject} takes ${describeType(expected)}; ${describeValue(value)} is ${describeType(type)}.`,
    );
  }

  /** The type of a value, or undefined if it does not resolve (reported if `report`). */
  private valueType(value: Value, path: Path, report: boolean): ValueType | undefined {
    const checker = this.checker;
    if ('literal' in value) {
      const found = literalType(value.literal);
      if (value.type === undefined) return found;
      const fitsDeclared = value.type === 'integer' ? found === 'integer' : fits(found, value.type);
      if (!fitsDeclared && report) {
        checker.error(
          [...path, 'literal'],
          `${JSON.stringify(value.literal)} is not ${describeType(value.type)}.`,
        );
      }
      return value.type;
    }
    if ('attribute' in value) {
      if (!report) {
        const found = checker.findAttribute(value.attribute);
        return found ? checker.attributeType(value.attribute, found.attribute) : undefined;
      }
      const resolved = checker.resolveAttribute(value.attribute, [...path, 'attribute']);
      return resolved ? checker.attributeType(value.attribute, resolved.attribute) : undefined;
    }
    if ('option' in value) {
      const [ref, optionId] = splitLast(value.option);
      if (!report) {
        return checker.findAttribute(ref)?.attribute.type === 'state' ? `state:${ref}` : undefined;
      }
      const resolved = checker.resolveAttribute(ref, [...path, 'option']);
      if (!resolved) return undefined;
      if (resolved.attribute.type !== 'state') {
        checker.error(
          [...path, 'option'],
          `\`${ref}\` is not a state attribute, so it has no options.`,
        );
        return undefined;
      }
      if (!Object.hasOwn(resolved.attribute.options, optionId)) {
        checker.error(
          [...path, 'option'],
          `\`${ref}\` has no option \`${optionId}\`${suggestion(optionId, Object.keys(resolved.attribute.options))}.`,
        );
        return undefined;
      }
      return `state:${ref}`;
    }
    if ('constant' in value) {
      const constant = report
        ? checker.resolveConstant(value.constant, [...path, 'constant'])
        : checker.constants.get(value.constant);
      return constant?.type;
    }
    const info = report
      ? this.resolveAct(value.evaluate, [...path, 'evaluate'])
      : this.acts.get(value.evaluate);
    if (!info) return undefined;
    if (info.act.kind !== 'evaluate') {
      if (report) {
        checker.error(
          [...path, 'evaluate'],
          `\`${value.evaluate}\` is a ${info.act.kind} act; only an evaluate has a value.`,
        );
      }
      return undefined;
    }
    return this.resultType(info);
  }

  /**
   * The type of an evaluate's result, as MetaABM's generators work it out: a
   * logical function gives a boolean; a function with a concrete output type
   * gives that; otherwise the inputs decide.
   */
  private resultType(info: ActInfo): ValueType {
    const cached = this.resultTypes.get(info.id);
    if (cached) return cached;
    if (this.computing.has(info.id) || info.act.kind !== 'evaluate') return 'generic';
    this.computing.add(info.id);
    const fn = this.checker.functions.get(info.act.function)?.fn;
    let type: ValueType;
    if (!fn) type = 'generic';
    else if (isLogicalFunction(fn)) type = 'boolean';
    else if (fn.kind === 'genericFunction' && !fn.output) type = 'none';
    else if (
      fn.kind === 'genericFunction' &&
      fn.output &&
      fn.output.type !== 'numeric' &&
      fn.output.type !== 'generic'
    ) {
      type = fn.output.type;
    } else {
      const types = (info.act.inputs ?? [])
        .filter((input): input is Value => !('multiValue' in input))
        .map((input) => this.valueType(input, info.path, false) ?? 'generic');
      type = combine(types);
    }
    this.computing.delete(info.id);
    this.resultTypes.set(info.id, type);
    return type;
  }

  // ────────────────────────────── Flow ──────────────────────────────

  private checkAcyclic(): void {
    const state = new Map<ActId, 'visiting' | 'done'>();
    const stack: ActId[] = [];
    const visit = (id: ActId) => {
      state.set(id, 'visiting');
      stack.push(id);
      const info = this.acts.get(id)!;
      info.act.targets?.forEach((target, index) => {
        if (!this.acts.has(target) || target === id) return;
        const seen = state.get(target);
        if (seen === 'visiting') {
          const cycle = [...stack.slice(stack.indexOf(target)), target];
          this.checker.error(
            [...info.path, 'targets', index],
            `This flow loops back: ${cycle.map((c) => `\`${c}\``).join(' → ')}. Flows are acyclic; repetition comes from rules, selections of all agents, and cause.`,
          );
        } else if (seen === undefined) {
          visit(target);
        }
      });
      stack.pop();
      state.set(id, 'done');
    };
    for (const id of this.acts.keys()) if (!state.has(id)) visit(id);
  }

  private checkReachable(): void {
    const reached = this.reached;
    const pending = [...this.acts.values()]
      .filter((info) => isRoot(info.act))
      .map((info) => info.id);
    while (pending.length > 0) {
      const id = pending.pop()!;
      if (reached.has(id)) continue;
      reached.add(id);
      for (const target of this.acts.get(id)?.act.targets ?? []) {
        if (this.acts.has(target)) pending.push(target);
      }
    }
    for (const info of this.acts.values()) {
      if (reached.has(info.id)) continue;
      this.checker.error(
        info.path,
        'No root act is upstream of this act, so it never runs. Make it a target of an act in a flow that starts at a rule, initialize or other root act.',
      );
    }
  }

  /** Every act upstream of an act: those whose flows reach it. */
  private upstream(id: ActId): ReadonlySet<ActId> {
    const cached = this.upstreamCache.get(id);
    if (cached) return cached;
    const found = new Set<ActId>();
    const pending = [...(this.sources.get(id) ?? [])];
    while (pending.length > 0) {
      const source = pending.pop()!;
      if (found.has(source) || !this.acts.has(source)) continue;
      found.add(source);
      pending.push(...(this.sources.get(source) ?? []));
    }
    this.upstreamCache.set(id, found);
    return found;
  }

  /** Reports a selection or evaluate named at `path` that is not upstream of the act `id`. */
  private requireUpstream(id: ActId, ref: ActId, path: Path, what: string): void {
    if (!this.acts.has(ref) || ref === id || this.upstream(id).has(ref)) return;
    this.checker.error(path, `\`${ref}\` is not upstream of this act. ${what}`);
  }

  /** Selections and values must come from upstream: they are bound only on the flows that pass through them. */
  private checkFlow({ id, act, path }: ActInfo): void {
    // An act no flow reaches is already reported; what is upstream of it says nothing more.
    if (!this.reached.has(id)) return;
    const SELECTION = 'A selection is bound only on the flows that pass through it.';
    if ('selected' in act && act.selected !== undefined) {
      this.requireUpstream(id, act.selected, [...path, 'selected'], SELECTION);
    }
    const values: [Value, Path][] = [];
    if (act.kind === 'set') values.push([act.parameter, [...path, 'parameter']]);
    if ((act.kind === 'create' || act.kind === 'load') && act.agentCount) {
      values.push([act.agentCount, [...path, 'agentCount']]);
    }
    if (act.kind === 'query' || act.kind === 'evaluate') {
      act.inputs?.forEach((input, index) => {
        if (!('multiValue' in input)) values.push([input, [...path, 'inputs', index]]);
      });
    }
    for (const [value, at] of values) {
      if ('evaluate' in value) {
        this.requireUpstream(
          id,
          value.evaluate,
          [...at, 'evaluate'],
          "An evaluate's value flows only to the acts downstream of it.",
        );
      }
      if (
        'attribute' in value &&
        value.selected !== undefined &&
        value.selected !== ('selected' in act ? act.selected : undefined)
      ) {
        this.requireUpstream(id, value.selected, [...at, 'selected'], SELECTION);
      }
    }
    if (act.kind === 'move' || act.kind === 'connect' || act.kind === 'replace') {
      this.requireUpstream(id, act.destination, [...path, 'destination'], SELECTION);
    }
    if (LOGIC_KINDS.has(act.kind)) {
      (this.sources.get(id) ?? []).forEach((source) => {
        const sourceAct = this.acts.get(source)?.act;
        if (sourceAct && sourceAct.kind !== 'query' && !LOGIC_KINDS.has(sourceAct.kind)) {
          this.checker.error(
            path,
            `\`${source}\` (a ${sourceAct.kind} act) flows into this ${act.kind} act. Logic acts combine queries and other logic acts.`,
          );
        }
      });
    }
  }

  // ─────────────────────────── Selections ───────────────────────────

  private checkSelections(): void {
    const queriesBySelection = new Map<ActId, ActInfo[]>();
    for (const info of this.acts.values()) {
      if (info.act.kind !== 'query') continue;
      const list = queriesBySelection.get(info.act.selected) ?? [];
      list.push(info);
      queriesBySelection.set(info.act.selected, list);
    }
    for (const [selectionId, queries] of queriesBySelection) {
      const selection = this.acts.get(selectionId);
      if (!selection || !isSelectLike(selection.act)) continue;
      const cardinality = queries.filter(
        (q) => q.act.kind === 'query' && CARDINALITY_FUNCTIONS.has(q.act.function),
      );
      const ordering = cardinality.filter(
        (q) => q.act.kind === 'query' && q.act.function !== 'all',
      );
      if (ordering.length > 1) {
        const [, second] = ordering;
        this.checker.error(
          second!.path,
          `Selection \`${selectionId}\` already has the cardinality term ${list(ordering.slice(0, 1).map((q) => (q.act as { function: string }).function))}; a selection picks by at most one of nearest, minimize and maximize.`,
        );
      }
      const space = 'space' in selection.act ? selection.act.space : undefined;
      for (const query of queries) {
        if (query.act.kind !== 'query') continue;
        const info = this.checker.functions.get(query.act.function);
        if (
          info &&
          isSpatial(info) &&
          isLogicalFunction(info.fn) &&
          !SPACELESS_SPATIAL_FUNCTIONS.has(query.act.function) &&
          space === undefined
        ) {
          this.checker.error(
            [...query.path, 'function'],
            `\`${query.act.function}\` looks in a space, but selection \`${selectionId}\` names none. Give the selection a \`space\`.`,
          );
        }
      }
      // R18: after a logic act, a query filters the agent already chosen.
      const picksOne = !cardinality.some((q) => q.act.kind === 'query' && q.act.function === 'all');
      if (!picksOne) continue;
      for (const query of queries) {
        const logic = (this.sources.get(query.id) ?? []).find((source) => {
          const sourceAct = this.acts.get(source)?.act;
          return sourceAct !== undefined && LOGIC_KINDS.has(sourceAct.kind);
        });
        if (logic === undefined) continue;
        this.checker.warn(
          query.path,
          `This query follows the logic act \`${logic}\`, so it filters the one agent selection \`${selectionId}\` has already chosen, rather than narrowing what it chooses from. If it should narrow the choice, make it a source of \`${logic}\` instead.`,
        );
      }
    }
  }
}

// ──────────────────────────── Messages ────────────────────────────

function describeValue(value: Value): string {
  if ('attribute' in value) return `\`${value.attribute}\``;
  if ('option' in value) return `\`${value.option}\``;
  if ('constant' in value) return `\`${value.constant}\``;
  if ('evaluate' in value) return `evaluate \`${value.evaluate}\``;
  return JSON.stringify(value.literal);
}

function describeAttributeType(attribute: Attribute): string {
  return attribute.type === 'state' ? 'a state' : describeType(attribute.type);
}

/** The path of a child: `region.farmer` from `region` and `farmer`. */
function childRef(parent: string, id: string): string {
  return parent === '' ? id : `${parent}.${id}`;
}

/** Splits a path into all but its last ID, and its last ID: `region.farmer.wealth` → `region.farmer`, `wealth`. */
function splitLast(ref: string): [string, string] {
  const dot = ref.lastIndexOf('.');
  return dot < 0 ? ['', ref] : [ref.slice(0, dot), ref.slice(dot + 1)];
}

function describeOwner(owner: Owner): string {
  return owner.ref === '' ? 'the root scape' : `${owner.kind} \`${owner.ref}\``;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function list(items: readonly string[]): string {
  return items.map((item) => `\`${item}\``).join(', ');
}

/** ", did you mean `x`?" for the candidate closest to `name`, if one is close. */
function suggestion(name: string, candidates: readonly string[]): string {
  let best: string | undefined;
  let bestDistance = Math.max(2, Math.floor(name.length / 3)) + 1;
  for (const candidate of candidates) {
    const d = editDistance(name.toLowerCase(), candidate.toLowerCase());
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best === undefined ? '' : ` (did you mean \`${best}\`?)`;
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length]!;
}
