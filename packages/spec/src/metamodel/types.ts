// SPDX-License-Identifier: EPL-2.0
//
// The Metascape model format. It is derived from the MetaABM metamodel, which
// began as "score", a component of Repast Simphony contributed under the
// Eclipse Public License by Argonne National Laboratory; was developed by
// Metascape from 2007 as MetaABM; and was contributed to Eclipse as part of the
// Agent Modeling Platform (AMP) in 2009. The mapping from MetaABM, and every
// departure from it, is described in docs/metamodel-review.md.

/*
 * The TypeScript types in this file are the definition of the format. The Zod
 * schemas in ./schema.ts validate untrusted input against exactly these types
 * (each schema is annotated with its type, so the compiler checks that they
 * agree) and yield a JSON Schema. Whether references resolve, flows are
 * acyclic and sinks fit their functions is checked separately, by
 * `checkModel` in ./check.ts.
 *
 * Shape of the format, which follows MetaABM:
 * - A model is its root scape. A scape holds agents, which may themselves be
 *   scapes, and spaces. Containment is nesting.
 * - Every element is keyed by its ID in the record that holds it. IDs are
 *   unique among siblings.
 * - Behaviour is a graph of acts. Each act lists the acts its flow goes on to
 *   (`targets`) and names the selection it works within (`selected`). Root acts
 *   (rule, initialize, build and so on) are the sources of every flow.
 * - Cross-references are paths of IDs, following the nesting, so IDs only need
 *   to be unique among siblings. Agents, spaces and attributes are referred to
 *   by their path from the root scape (`bug`, `region.farmer`, `bug.energy`,
 *   `bugCount`); acts by their path within their agent's or style's acts
 *   (`bugRule`, or `moves.step` for an act in a group). Functions and constants
 *   are referred to by their ID in the function library.
 */

// ─────────────────────────────── IDs ───────────────────────────────

/** An ID: a letter or underscore, then letters, digits and underscores. */
export type Id = string;
/** The ID of an act. */
export type ActId = Id;
/** The ID of an agent or scape. */
export type AgentId = Id;
/** The ID of a space. */
export type SpaceId = Id;
/** The ID of an attribute. */
export type AttributeId = Id;
/** The ID of an option of a state attribute. */
export type OptionId = Id;
/** The ID of a function, unique across the function library. */
export type FunctionId = Id;
/** The ID of a constant, unique across the function library. */
export type ConstantId = Id;

/**
 * An act, by its path within the acts of its agent (or style): `bugRule`, or
 * `moves.step` for the act `step` in the group `moves`.
 */
export type ActRef = string;
/** An agent or scape, by its path from the root scape: `bug`, `region.farmer`. */
export type AgentRef = string;
/** A space, by its path from the root scape: `grid2D`, `region.roads`. */
export type SpaceRef = string;
/**
 * An attribute, by the path of its owner (an agent, scape or space) from the
 * root scape, then its ID: `bug.energy`, `grid2D.width`, `region.farmer.wealth`.
 * An attribute of the root scape is its ID alone: `bugCount`.
 */
export type AttributeRef = string;
/** An option of a state attribute: the attribute, then the option's ID: `person.status.infected`. */
export type OptionRef = string;

/** Labels for display. MetaABM's `IID.label` and `SNamed`. */
export interface Named {
  /** Display name. Default: derived from the ID. */
  label?: string | undefined;
  /** Plural display name, such as "Bugs". */
  pluralLabel?: string | undefined;
  description?: string | undefined;
}

// ──────────────────────────── Attributes ────────────────────────────

/** The type of an attribute's value. MetaABM's `SAttributeType`, less the prototype-only types. */
export type AttributeType = 'boolean' | 'integer' | 'real' | 'symbol';

/** A literal value: a boolean, a number (integer or real) or a symbol. */
export type LiteralValue = boolean | number | string;

/**
 * An extension of an element, such as the system dynamics extension. MetaABM's
 * `IModelExtension`, `IAgentChild` and `IAttributeChild`. Not supported yet: the
 * extensions themselves are ported later.
 */
export interface Extension {
  /** What kind of extension this is. */
  kind: string;
  [property: string]: unknown;
}

/** What every attribute has. MetaABM's `SAttribute`. */
interface AttributeBase extends Named {
  /** Whether values of this attribute are recorded as the model runs. */
  gatherData?: boolean | undefined;
  /** Units of measure, for display. */
  units?: string | undefined;
  /** Whether the value is fixed once the agent exists. */
  immutable?: boolean | undefined;
  /** Whether the value is computed by a derive act rather than stored. */
  derived?: boolean | undefined;
  extensions?: Extension[] | undefined;
}

/** An attribute holding a boolean, number or symbol. */
export interface ValueAttribute extends AttributeBase {
  type: AttributeType;
  /**
   * The value an agent starts with. Default: false, 0 or the empty symbol.
   * MetaABM stores this as a string; the format stores a literal of the
   * attribute's type.
   */
  default?: LiteralValue | undefined;
  /** Smallest sensible value, for numeric attributes (used by editors). Not in MetaABM. */
  min?: number | undefined;
  /** Largest sensible value, for numeric attributes (used by editors). Not in MetaABM. */
  max?: number | undefined;
}

/** One of the values a state attribute can take. MetaABM's `SStateValue`. */
export type StateOption = Named;

/** An attribute whose value is one of a fixed set of options. MetaABM's `SState`. */
export interface StateAttribute extends AttributeBase {
  type: 'state';
  /** The options, in order. At least one. */
  options: Record<OptionId, StateOption>;
  /** The option an agent starts with. Default: the first. */
  defaultOption?: OptionId | undefined;
}

export type Attribute = ValueAttribute | StateAttribute;

// ───────────────────────────── Spaces ─────────────────────────────

/**
 * What happens at the edge of a space: `periodic` wraps around, `sticky` stops
 * at the edge. MetaABM's strict and bouncy rules are Repast-only and dropped.
 */
export type BorderRule = 'periodic' | 'sticky';

/** Which cells of a grid are neighbours. */
export type Neighborhood = 'euclidean' | 'moore' | 'vonNeumann';

/** What every space has. MetaABM's `SProjection`. */
interface SpaceBase extends Named {
  /** The space's own attributes, which include its sizes. */
  attributes?: Record<AttributeId, Attribute> | undefined;
}

/** A space with a number of dimensions. MetaABM's `SNDimensional`. */
interface DimensionalSpace extends SpaceBase {
  /**
   * The space's size attributes, in order, such as `['width', 'height']`.
   * Each is an attribute of this space. The number of dimensions is the length
   * of this list.
   */
  dimensions: AttributeId[];
  /** Default `sticky`. */
  borderRule?: BorderRule | undefined;
}

/** A continuous space. MetaABM's `SContinuousSpace`. */
export interface ContinuousSpace extends DimensionalSpace {
  kind: 'continuous';
}

/** A grid of cells. MetaABM's `SGrid`. */
export interface GridSpace extends DimensionalSpace {
  kind: 'grid';
  neighborhood: Neighborhood;
  /** Whether a cell may hold more than one occupant. Default false. */
  multiOccupant?: boolean | undefined;
}

/** A network of links between agents. MetaABM's `SNetwork`. */
export interface NetworkSpace extends SpaceBase {
  kind: 'network';
  /** Whether links have a direction. Default false. */
  directed?: boolean | undefined;
}

/** A geographic space. MetaABM's `SGeography`. Not supported yet. */
export interface GeographySpace extends SpaceBase {
  kind: 'geography';
}

export type Space = ContinuousSpace | GridSpace | NetworkSpace | GeographySpace;

/** A value layer. MetaABM's `SValueLayer`, which is only a name. Not supported yet. */
export type ValueLayer = Named;

// ───────────────────────────── Styles ─────────────────────────────

/** What every style has: acts that declare how the agent looks. MetaABM's `SStyle`. */
interface StyleBase extends Named {
  /** The style's acts, by ID. MetaABM's root group of the style. */
  acts?: Record<ActId, Act> | undefined;
}

/** A two-dimensional style. MetaABM's `SStyle2D`. */
export interface Style2D extends StyleBase {
  kind: '2d';
}

/** A three-dimensional style. MetaABM's `SStyle3D`. */
export interface Style3D extends StyleBase {
  kind: '3d';
}

/** The kind of shape a shaped agent has. MetaABM's `SShapeType`. */
export type ShapeType = 'point' | 'line' | 'polygon';

/** A style for agents drawn as geographic shapes. MetaABM's `SStyleShape`. Not supported yet. */
export interface ShapeStyle extends StyleBase {
  kind: 'shape';
  shape: ShapeType;
}

export type Style = Style2D | Style3D | ShapeStyle;

// ────────────────────────── Agents and scapes ──────────────────────────

/**
 * How the rules of an agent's population run each period, as Ascape's scape
 * settings. Not in MetaABM, whose generators gave every population the
 * defaults below (R14). They can be changed while a model runs.
 */
export interface ExecutionSettings {
  /**
   * `rule` (Ascape's rule order): each rule runs across every agent before the
   * next rule starts. `agent`: each agent runs every rule before the next agent
   * starts. Default `rule`.
   */
  order?: 'rule' | 'agent' | undefined;
  /** Whether agents are visited in a fresh random order each period. Default true. */
  randomOrder?: boolean | undefined;
  /**
   * The rule acts (and schedule and diffuse acts), by their paths within the
   * agent's acts, in the order they run. Those not listed run after the listed ones, in the order of the acts.
   * Default: the order of the acts.
   */
  rules?: ActRef[] | undefined;
}

/** What every agent has. MetaABM's `SAgent`. */
interface AgentBase extends Named {
  attributes?: Record<AttributeId, Attribute> | undefined;
  /**
   * The agent's acts, by ID: the members of MetaABM's root group (`rootActivity`),
   * whose own ID and label nothing refers to.
   */
  acts?: Record<ActId, Act> | undefined;
  styles?: Record<Id, Style> | undefined;
  extensions?: Extension[] | undefined;
  /** How the agent's rules run. Default: as MetaABM's generators ran them (R14). */
  execution?: ExecutionSettings | undefined;
}

/** An agent type. MetaABM's `SAgent`. */
export interface Agent extends AgentBase {
  kind: 'agent';
}

/**
 * What every scape has: an agent that also holds agents and spaces. MetaABM's
 * `SContext`. A scape's own attributes are the model's parameters.
 */
interface ScapeBase extends AgentBase {
  /** The agents in this scape. Each may itself be a scape. */
  agents?: Record<AgentId, Agent | Scape> | undefined;
  spaces?: Record<SpaceId, Space> | undefined;
  valueLayers?: Record<Id, ValueLayer> | undefined;
}

/** A scape within another scape. */
export interface Scape extends ScapeBase {
  kind: 'scape';
}

/** The languages a model's methods can be written in. */
export type ImplementationLanguage = 'typescript';

/** The version of the format described here. */
export const MODEL_SCHEMA_VERSION = 2;

/** A model: its root scape. */
export interface Model extends ScapeBase {
  schemaVersion: typeof MODEL_SCHEMA_VERSION;
  /** The ID of the root scape. References start below it, so they do not include it. */
  id: AgentId;
  /** The language method bodies are written in. */
  language: ImplementationLanguage;
}

// ──────────────────────────── Functions ────────────────────────────

/**
 * The type of a function's input or output. Besides the attribute types,
 * `numeric` is an integer or a real, and `generic` is any value (MetaABM's
 * `NUMERIC` and `UNDEFINED`).
 */
export type PrototypeType = AttributeType | 'numeric' | 'generic';

/** An input or output of a function. MetaABM's `FArgumentPrototype`. */
export interface Prototype extends Named {
  type: PrototypeType;
  /** Whether an input may be left out. Optional inputs come last. */
  optional?: boolean | undefined;
  /**
   * Whether the input takes a multi-value: a list of attributes rather than a
   * single value. MetaABM's `FMultiArgumentPrototype`.
   */
  multiple?: boolean | undefined;
}

/** What every function has. MetaABM's `FFunction`. */
interface FunctionBase extends Named {
  /** The inputs, in order. */
  inputs?: Record<Id, Prototype> | undefined;
}

/** An operator, such as `+`. Its result type follows its inputs. MetaABM's `FOperator`. */
export interface OperatorFunction extends FunctionBase {
  kind: 'operator';
  symbol?: string | undefined;
}

/** An operator whose result is a boolean, such as `<`. MetaABM's `FLogicalOperator`. */
export interface LogicalOperatorFunction extends FunctionBase {
  kind: 'logicalOperator';
  symbol?: string | undefined;
}

/**
 * A function with at most one result. A function with no output (such as
 * `colorRed`) contributes to a flow but has no value. MetaABM's `FGenericFunction`.
 */
export interface GenericFunction extends FunctionBase {
  kind: 'genericFunction';
  output?: Prototype | undefined;
}

/** A function whose result is a boolean, such as `neighbor`. MetaABM's `FGenericLogical`. */
export interface GenericLogicalFunction extends FunctionBase {
  kind: 'genericLogical';
}

export type LibraryFunction =
  OperatorFunction | LogicalOperatorFunction | GenericFunction | GenericLogicalFunction;

/** A library of functions, which may hold further libraries. MetaABM's `FLibrary`. */
/**
 * A named value of the library, such as `true` or `unit`. MetaABM's core
 * library holds these as attributes of its context.
 */
export interface Constant extends Named {
  /** `numeric` for a number that takes the type of where it is used. */
  type: PrototypeType;
  value: LiteralValue;
}

export interface Library extends Named {
  constants?: Record<ConstantId, Constant> | undefined;
  functions?: Record<FunctionId, LibraryFunction> | undefined;
  subs?: Record<Id, Library> | undefined;
}

// ───────────────────────────── Values ─────────────────────────────

/**
 * A value an act reads. MetaABM's `IValue` (and, for inputs, `AInput`):
 * - `{ attribute }`: an attribute of the agent bound by `selected` (default: the
 *   act's own selection). Choosing `selected` is how selections are woven
 *   through a flow.
 * - `{ option }`: an option of a state attribute.
 * - `{ evaluate }`: the value of an evaluate act upstream in the same flow.
 * - `{ constant }`: a constant of the function library, such as `unit`. A
 *   numeric constant takes the type of where it is used: `unit` is 1 in a grid
 *   and 1.0 in a continuous space.
 * - `{ literal }`: a literal. Its type is `type` if given; otherwise boolean,
 *   symbol (for a string), integer (for a whole number) or real.
 */
export type Value =
  | { attribute: AttributeRef; selected?: ActRef | undefined }
  | { option: OptionRef }
  | { evaluate: ActRef }
  | { constant: ConstantId }
  | { literal: LiteralValue; type?: AttributeType | undefined };

/**
 * An input of a sink: a value, or a multi-value. A multi-value lists the
 * attributes a distribution varies by (MetaABM's `AMultiValue`), and fits only
 * an input prototype marked `multiple`.
 */
export type Input = Value | { multiValue: AttributeRef[] };

// ────────────────────────────── Acts ──────────────────────────────

/** What every act in a flow has. MetaABM's `AAct`. */
interface FlowAct extends Named {
  /** The acts this act's flow goes on to, in order. */
  targets?: ActRef[] | undefined;
}

/** An act that works within a selection made upstream. */
interface SelectedAct extends FlowAct {
  /** The select (or create, or root act) whose selection this act works within. */
  selected: ActRef;
}

/** A group of acts within a group. MetaABM's `AGroup`. */
export interface GroupAct extends Named {
  kind: 'group';
  members: Record<ActId, Act>;
}

/**
 * What every root act has. A root act is the source of a flow and is its own
 * selection: it selects the agent that owns it (for a style, the styled agent).
 * MetaABM's `ARoot`.
 */
interface RootActBase extends FlowAct {
  /** The space the root's selection is in. */
  space?: SpaceRef | undefined;
}

/** Runs once per agent per period. MetaABM's `ARule`. */
export interface RuleAct extends RootActBase {
  kind: 'rule';
}

/** Runs on a schedule. MetaABM's `ASchedule`. */
export interface ScheduleAct extends RootActBase {
  kind: 'schedule';
  start?: number | undefined;
  interval?: number | undefined;
  priority?: number | undefined;
  pick?: number | undefined;
}

/** Runs once per scape, before any initialize. MetaABM's `ABuild`. */
export interface BuildAct extends RootActBase {
  kind: 'build';
}

/** Runs once per agent present at the start. MetaABM's `AInitialize`. */
export interface InitializeAct extends RootActBase {
  kind: 'initialize';
}

/** Runs whenever an attribute is set. MetaABM's `AWatch`. */
export interface WatchAct extends RootActBase {
  kind: 'watch';
  attribute: AttributeRef;
}

/** Computes a derived attribute: its value is the last evaluate on the path. MetaABM's `ADerive`. */
export interface DeriveAct extends RootActBase {
  kind: 'derive';
  attribute: AttributeRef;
}

/**
 * Diffuses an attribute across the cells of a grid, with the grid's
 * neighbourhood. MetaABM's `ADiffuse`.
 */
export interface DiffuseAct extends RootActBase {
  kind: 'diffuse';
  diffused: AttributeRef;
  diffusionRate?: AttributeRef | undefined;
  evaporationRate?: AttributeRef | undefined;
}

/** Runs only when a cause names it. MetaABM's `APerform`. */
export interface PerformAct extends RootActBase {
  kind: 'perform';
}

export type RootAct =
  RuleAct | ScheduleAct | BuildAct | InitializeAct | WatchAct | DeriveAct | DiffuseAct | PerformAct;

/**
 * Selects agents of a type, from the agent bound by `selected`. The queries
 * that work within this selection constrain the set; a cardinality query (`all`,
 * `nearest`, `minimize`, `maximize`) says how many flow on, and without one a
 * single agent is chosen at random. MetaABM's `ASelect`.
 */
export interface SelectAct extends SelectedAct {
  kind: 'select';
  /** The agent type to select. Without one, a select in a grid selects cells or locations. */
  agent?: AgentRef | undefined;
  space?: SpaceRef | undefined;
}

/**
 * Creates agents, which then flow on as a selection. MetaABM's
 * `ACreateAgents`, and with `shape` its `ACreateShapedAgents` (not supported yet).
 */
export interface CreateAct extends SelectedAct {
  kind: 'create';
  agent: AgentRef;
  space?: SpaceRef | undefined;
  /** How many agents to create. */
  agentCount?: Value | undefined;
  shape?: ShapeType | undefined;
}

/**
 * Creates agents from a file. MetaABM's `ALoadAgents` and `ALoadShapedAgents`.
 * Not supported yet.
 */
export interface LoadAct extends SelectedAct {
  kind: 'load';
  agent: AgentRef;
  space?: SpaceRef | undefined;
  agentCount?: Value | undefined;
  sourceURL: string;
  shape?: ShapeType | undefined;
}

export type SelectLikeAct = RootAct | SelectAct | CreateAct | LoadAct;

/** A constraint on its selection, which passes what satisfies it. MetaABM's `AQuery`. */
export interface QueryAct extends SelectedAct {
  kind: 'query';
  /** A logical function. */
  function: FunctionId;
  inputs?: Input[] | undefined;
}

/** Computes a value, which flows to its targets. Evaluates are pure. MetaABM's `AEvaluate`. */
export interface EvaluateAct extends SelectedAct {
  kind: 'evaluate';
  function: FunctionId;
  inputs?: Input[] | undefined;
}

/**
 * A set operation on flows of queries and logic acts: `all` passes what
 * reaches it along every incoming path (intersection), `any` what reaches it
 * along at least one (union), `none` what reaches it along none (difference).
 * MetaABM's `AAll`, `AAny` and `ANone`.
 */
export interface LogicAct extends SelectedAct {
  kind: 'all' | 'any' | 'none';
}

/** Sets an attribute of the agent bound by `selected`. MetaABM's `ASet`. */
export interface SetAct extends SelectedAct {
  kind: 'set';
  attribute: AttributeRef;
  parameter: Value;
}

/** Moves the agent bound by `selected` to the agent or location bound by `destination`. MetaABM's `AMove`. */
export interface MoveAct extends SelectedAct {
  kind: 'move';
  /** A select upstream. */
  destination: ActRef;
}

/** Removes the agent bound by `selected` from its space. MetaABM's `ALeave`. */
export interface LeaveAct extends SelectedAct {
  kind: 'leave';
}

/** Removes the agent bound by `selected` from the model. MetaABM's `ADie`. */
export interface DieAct extends SelectedAct {
  kind: 'die';
}

/** Links the agent bound by `selected` to the one bound by `destination`. MetaABM's `AConnect`. */
export interface ConnectAct extends SelectedAct {
  kind: 'connect';
  destination: ActRef;
  /** A network space. */
  within: SpaceRef;
  /** Default true. */
  directed?: boolean | undefined;
}

/** Removes every link of the agent bound by `selected`. MetaABM's `ADisconnect`. */
export interface DisconnectAct extends SelectedAct {
  kind: 'disconnect';
  within: SpaceRef;
}

/**
 * Removes every link of the agent bound by `selected`, then links it to the
 * one bound by `destination`. MetaABM's `AReplace`.
 */
export interface ReplaceAct extends SelectedAct {
  kind: 'replace';
  destination: ActRef;
  within: SpaceRef;
  /** Default true. */
  directed?: boolean | undefined;
}

/** Runs a root act on the current selection. MetaABM's `ACause`. */
export interface CauseAct extends SelectedAct {
  kind: 'cause';
  /** A root act of the same agent or style. */
  result: ActRef;
}

/**
 * Runs code. MetaABM's `AMethod`. The code is an implementation given to
 * `compileModel` (`methods`), or a body held here, in the model's language,
 * which is run only if `compileModel` is told to allow it (R21).
 */
export interface MethodAct extends FlowAct {
  kind: 'method';
  selected?: ActRef | undefined;
  /** Code held in the model. Never run unless allowed. */
  body?: string | undefined;
  /**
   * The implementation is provided by whoever runs the model, not held in it;
   * a model whose method is provided cannot run without it. Not with `body`.
   */
  provided?: boolean | undefined;
}

/**
 * What every builder act has: it places agents in a space. MetaABM's
 * `ABuildProjection`, without the deprecated `networkType` and `spaceType`.
 */
interface BuildSpaceBase extends SelectedAct {
  /** The agents the space holds. */
  agents?: AgentRef[] | undefined;
  space: SpaceRef;
  attributes?: AttributeRef[] | undefined;
}

/** Builds a grid, filling its cells with `fillAgent`. MetaABM's `ABuildGrid`. */
export interface BuildGridAct extends BuildSpaceBase {
  kind: 'buildGrid';
  fillAgent?: AgentRef | undefined;
}

/** Builds a continuous space. MetaABM's `ABuildSpace`. */
export interface BuildContinuousAct extends BuildSpaceBase {
  kind: 'buildSpace';
}

/** Builds a network. Its links are made by connect acts. MetaABM's `ABuildNetwork`. */
export interface BuildNetworkAct extends BuildSpaceBase {
  kind: 'buildNetwork';
}

/** Builds a geography. MetaABM's `ABuildGeography`. Not supported yet. */
export interface BuildGeographyAct extends BuildSpaceBase {
  kind: 'buildGeography';
}

export type Act =
  | GroupAct
  | RootAct
  | SelectAct
  | CreateAct
  | LoadAct
  | QueryAct
  | EvaluateAct
  | LogicAct
  | SetAct
  | MoveAct
  | LeaveAct
  | DieAct
  | ConnectAct
  | DisconnectAct
  | ReplaceAct
  | CauseAct
  | MethodAct
  | BuildGridAct
  | BuildContinuousAct
  | BuildNetworkAct
  | BuildGeographyAct;

export type ActKind = Act['kind'];

/** The kinds of root act. */
export const ROOT_ACT_KINDS = [
  'rule',
  'schedule',
  'build',
  'initialize',
  'watch',
  'derive',
  'diffuse',
  'perform',
] as const satisfies readonly RootAct['kind'][];

// ─────────────────────────── Diagnostics ───────────────────────────

/** A problem found in a model, with the path of the offending part. */
export interface Diagnostic {
  /**
   * The model file the problem is in, by its model ID, when it is not the model
   * checked: a problem in an overlay is reported against the overlay.
   */
  file?: string | undefined;
  /** For example `agents.bug.acts.nearbySpace.targets[0]`. */
  path: string;
  /**
   * `error`: the model is wrong. `warning`: the model is valid but probably not
   * what was meant, or uses something not supported yet.
   */
  severity: 'error' | 'warning';
  message: string;
}
