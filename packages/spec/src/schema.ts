// SPDX-License-Identifier: EPL-2.0
import { z } from 'zod';

/*
 * The Metascape model format: a model described entirely as data.
 *
 * The TypeScript types in this file are the definition of the format. The Zod
 * schemas beside them validate untrusted input (a JSON file, an editor's
 * state) against exactly those types, and yield a JSON Schema for editors.
 * Checking that references resolve and that expressions are well typed is a
 * separate step (see `checkModel`).
 *
 * Shape of the format:
 * - A model has parameters, spaces, agent types and views.
 * - Structure follows nesting: an agent type owns its attributes and rules.
 * - Everything is referred to by name. Names are keys of the records below.
 * - Behaviour is a list of actions per rule. Actions read values through
 *   expressions and find other agents through selections, which bind the
 *   agents they find to a name that later expressions can use.
 */

/** A name: starts with a lower-case letter, then letters and digits. */
export type Name = string;
const name = z
  .string()
  .regex(/^[a-z][A-Za-z0-9]*$/, 'Names start with a lower-case letter, then letters and digits');

const label = { label: z.string().optional(), description: z.string().optional() };
interface Labelled {
  /** Display name. Default: derived from the key. */
  label?: string | undefined;
  description?: string | undefined;
}

// ───────────────────────────── Expressions ─────────────────────────────

/**
 * A reference to a value, written as a dotted path:
 * - `energy` or `self.energy`: an attribute of the acting agent, or a local variable
 * - `other.energy`: an attribute of an agent bound by a selection (`as`)
 * - `self.cell.sugar`: an attribute of the cell an occupant stands on
 * - `self.x`, `self.y`: position; `self.id`: the agent's id
 * - `param.density`: a model parameter
 * - `space.land.width`, `space.land.height`: the size of a space
 * - `tick`: the current tick
 */
export type Reference = string;
const reference = z
  .string()
  .regex(
    /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)*$/,
    'A reference is a dotted path of names, such as self.energy',
  );

/** The functions an expression can apply, by category. */
export const operators = {
  arithmetic: ['add', 'sub', 'mul', 'div', 'mod', 'pow', 'neg', 'abs', 'min', 'max', 'clamp'],
  rounding: ['floor', 'ceil', 'round'],
  math: ['sqrt', 'exp', 'log', 'sin', 'cos', 'atan2'],
  comparison: ['eq', 'ne', 'lt', 'le', 'gt', 'ge'],
  logic: ['and', 'or', 'not'],
  /** `if(condition, then, else)`. */
  choice: ['if'],
  /**
   * `random()` is uniform in [0, 1); `randomInt(a, b)` an integer in a..b
   * inclusive; `randomReal(a, b)` uniform in [a, b); `chance(p)` true with
   * probability p. All draw from the acting agent's seeded stream.
   */
  random: ['random', 'randomInt', 'randomReal', 'chance'],
  /** `distance(a, b)` between two agents in their shared space. */
  spatial: ['distance'],
  /** `rgb(r, g, b)` with channels 0..255; `mix(from, to, t)` with t in 0..1. */
  color: ['rgb', 'mix'],
} as const;

export type Operator = (typeof operators)[keyof typeof operators][number];
const operatorNames = Object.values(operators).flat() as [Operator, ...Operator[]];

/** How the agents found by a selection are combined into one value. */
export type AggregateKind = 'count' | 'any' | 'all' | 'sum' | 'mean' | 'min' | 'max';

/** A value computed from the model's state. Literals are numbers and booleans. */
export type Expression =
  | number
  | boolean
  | Reference
  /** One of the named options of a state attribute. */
  | { state: Name }
  /** A colour, `#rrggbb`. */
  | { color: string }
  /** A function applied to arguments. */
  | { op: Operator; args: Expression[] }
  /**
   * A value over the agents a selection finds. `count`, `any` and `all` test
   * the selection (with `of` as a further condition when given); `sum`,
   * `mean`, `min` and `max` need `of`, the value to combine.
   */
  | { aggregate: AggregateKind; over: Selection; of?: Expression | undefined };

// ───────────────────────────── Selections ──────────────────────────────

/**
 * Where a selection looks, relative to its origin agent:
 * - `neighbors`: on the cells adjacent to the origin's cell
 * - `within`: within `radius` of the origin (grid or continuous space)
 * - `here`: on the origin's own cell
 * - `linked`: joined to the origin by a link of `network`
 * - `all`: anywhere
 */
export type SelectionScope = 'neighbors' | 'within' | 'here' | 'linked' | 'all';

/** Finds agents of one type, optionally narrowed by a condition. */
export interface Selection {
  /** The agent type to find. */
  type: Name;
  from: SelectionScope;
  /** Reference to the origin agent. Default `self`. */
  of?: Reference | undefined;
  /** Required for `within`. */
  radius?: Expression | undefined;
  /** Required for `linked`. */
  network?: Name | undefined;
  /** The name each found agent is bound to in `where` and beyond. Default `other`. */
  as?: Name | undefined;
  /** Keeps only the agents for which this is true. */
  where?: Expression | undefined;
}

/**
 * Which single agent to take from a selection. Ties are broken at random.
 * - `random`: any of them
 * - `nearest`: the closest to the origin
 * - `{ max }` / `{ min }`: the one with the largest / smallest value
 */
export type Pick = 'random' | 'nearest' | { max: Expression } | { min: Expression };

/** A selection reduced to at most one agent. */
export interface Choice extends Selection {
  /** Default `random`. */
  pick?: Pick | undefined;
}

// ─────────────────────────────── Actions ───────────────────────────────

/** One step of a rule. Actions in a list run in order. */
export type Action =
  /** Assigns an attribute, such as `energy` or `other.energy`. */
  | { set: Reference; to: Expression }
  /** Defines a local variable for the rest of the enclosing action list. */
  | { let: Name; value: Expression }
  /** Runs `then` or `else` depending on a condition. */
  | { if: Expression; then: Action[]; else?: Action[] | undefined }
  /** Binds one chosen agent to its `as` name and runs `do`; runs `else` if none is found. */
  | { with: Choice; do: Action[]; else?: Action[] | undefined }
  /** Runs `do` once for each agent a selection finds, bound to its `as` name. */
  | { forEach: Selection; do: Action[] }
  /** Moves the acting agent on a grid to a chosen cell, or onto the cell of a chosen agent. */
  | { moveTo: Choice }
  /** Moves the acting agent in a continuous space by a displacement. */
  | { moveBy: { dx: Expression; dy: Expression } }
  /** Moves the acting agent in a continuous space toward (or, if negative, away from) an agent. */
  | { moveToward: Reference; distance: Expression }
  /** Removes an agent. Default: the acting agent. */
  | { die: true | Reference }
  /**
   * Creates agents of a type. `at` places them: on the acting agent's cell or
   * position (`here`), a random free neighbouring cell (`neighbor`), or
   * anywhere (`random`, the default). `set` overrides initial attribute values.
   */
  | {
      create: Name;
      count?: Expression | undefined;
      at?: 'here' | 'neighbor' | 'random' | undefined;
      set?: Record<Name, Expression> | undefined;
    }
  /** Links the acting agent to another in a network. */
  | { connect: Reference; network: Name }
  /** Removes the link between the acting agent and another. */
  | { disconnect: Reference; network: Name }
  /** Ends the run. */
  | { stop: string };

// Recursive schemas. Each is annotated with its type above, so the compiler
// verifies that schema and type agree.

const expression: z.ZodType<Expression> = z.lazy(() =>
  z.union([
    z.number(),
    z.boolean(),
    reference,
    z.strictObject({ state: name }),
    z.strictObject({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'A colour is #rrggbb') }),
    z.strictObject({ op: z.enum(operatorNames), args: z.array(expression) }),
    z.strictObject({
      aggregate: z.enum(['count', 'any', 'all', 'sum', 'mean', 'min', 'max']),
      over: selection,
      of: expression.optional(),
    }),
  ]),
);

const selectionShape = {
  type: name,
  from: z.enum(['neighbors', 'within', 'here', 'linked', 'all']),
  of: reference.optional(),
  radius: expression.optional(),
  network: name.optional(),
  as: name.optional(),
  where: expression.optional(),
};
const selection: z.ZodType<Selection> = z.lazy(() => z.strictObject(selectionShape));

const pick: z.ZodType<Pick> = z.union([
  z.literal('random'),
  z.literal('nearest'),
  z.strictObject({ max: expression }),
  z.strictObject({ min: expression }),
]);
const choice: z.ZodType<Choice> = z.lazy(() =>
  z.strictObject({ ...selectionShape, pick: pick.optional() }),
);

const action: z.ZodType<Action> = z.lazy(() =>
  z.union([
    z.strictObject({ set: reference, to: expression }),
    z.strictObject({ let: name, value: expression }),
    z.strictObject({ if: expression, then: actions, else: actions.optional() }),
    z.strictObject({ with: choice, do: actions, else: actions.optional() }),
    z.strictObject({ forEach: selection, do: actions }),
    z.strictObject({ moveTo: choice }),
    z.strictObject({ moveBy: z.strictObject({ dx: expression, dy: expression }) }),
    z.strictObject({ moveToward: reference, distance: expression }),
    z.strictObject({ die: z.union([z.literal(true), reference]) }),
    z.strictObject({
      create: name,
      count: expression.optional(),
      at: z.enum(['here', 'neighbor', 'random']).optional(),
      set: z.record(name, expression).optional(),
    }),
    z.strictObject({ connect: reference, network: name }),
    z.strictObject({ disconnect: reference, network: name }),
    z.strictObject({ stop: z.string() }),
  ]),
);
const actions = z.array(action);

// ───────────────────────── Parameters and attributes ───────────────────

/** A model parameter. The same shapes as the engine's typed parameters. */
export type ParameterSpec = Labelled &
  (
    | { type: 'int' | 'real'; default: number; min?: number | undefined; max?: number | undefined }
    | { type: 'boolean'; default: boolean }
    | { type: 'choice'; options: string[]; default: string }
    | { type: 'text'; default: string }
  );
const parameter: z.ZodType<ParameterSpec> = z.union([
  z.strictObject({
    type: z.enum(['int', 'real']),
    default: z.number(),
    min: z.number().optional(),
    max: z.number().optional(),
    ...label,
  }),
  z.strictObject({ type: z.literal('boolean'), default: z.boolean(), ...label }),
  z.strictObject({
    type: z.literal('choice'),
    options: z.array(z.string()).min(1),
    default: z.string(),
    ...label,
  }),
  z.strictObject({ type: z.literal('text'), default: z.string(), ...label }),
]);

/** A summary statistic recorded for a numeric attribute. */
export type StatisticName = 'count' | 'sum' | 'mean' | 'min' | 'max' | 'variance' | 'stdDev';
const statistic = z.enum(['count', 'sum', 'mean', 'min', 'max', 'variance', 'stdDev']);

/**
 * A piece of an agent's state.
 *
 * `initial` is evaluated when the agent is created (default 0, false, or the
 * first state). `record` asks for data to be collected every tick: statistics
 * for numbers (`true` means count, sum, mean, min and max), the number of
 * agents for which a boolean is true, and the number of agents in each state.
 */
export type AttributeSpec = Labelled &
  (
    | {
        type: 'int' | 'real';
        initial?: Expression | undefined;
        record?: boolean | StatisticName[] | undefined;
      }
    | { type: 'boolean'; initial?: Expression | undefined; record?: boolean | undefined }
    | {
        type: 'state';
        states: Name[];
        initial?: Expression | undefined;
        record?: boolean | undefined;
      }
  );
const attribute: z.ZodType<AttributeSpec> = z.union([
  z.strictObject({
    type: z.enum(['int', 'real']),
    initial: expression.optional(),
    record: z.union([z.boolean(), z.array(statistic).min(1)]).optional(),
    ...label,
  }),
  z.strictObject({
    type: z.literal('boolean'),
    initial: expression.optional(),
    record: z.boolean().optional(),
    ...label,
  }),
  z.strictObject({
    type: z.literal('state'),
    states: z.array(name).min(2),
    initial: expression.optional(),
    record: z.boolean().optional(),
    ...label,
  }),
]);

// ─────────────────────────── Agents and spaces ─────────────────────────

/** Behaviour an agent type follows every tick. */
export interface RuleSpec {
  name: string;
  /** The rule applies only to agents for which this is true. */
  when?: Expression | undefined;
  do: Action[];
  /**
   * When true, every agent first works out its changes from the state at the
   * start of the tick, and only then do all `set` actions take effect, so the
   * outcome does not depend on the order agents act in. Default false.
   */
  synchronous?: boolean | undefined;
}
const rule: z.ZodType<RuleSpec> = z.strictObject({
  name: z.string().min(1),
  when: expression.optional(),
  do: actions,
  synchronous: z.boolean().optional(),
});

/** How agents of a type are drawn. */
export interface StyleSpec {
  /** A colour-valued expression evaluated per agent. */
  color?: Expression | undefined;
  shape?: 'circle' | 'square' | undefined;
  /** Agents for which this is true are not drawn. */
  hidden?: Expression | undefined;
}
const style: z.ZodType<StyleSpec> = z.strictObject({
  color: expression.optional(),
  shape: z.enum(['circle', 'square']).optional(),
  hidden: expression.optional(),
});

/** A kind of agent: its state, behaviour, where it lives and how it looks. */
export interface AgentSpec extends Labelled {
  /** The grid or continuous space agents of this type live in, if any. */
  space?: Name | undefined;
  /** On a grid: whether this type forms the lattice itself or stands on it. Default `occupant`. */
  as?: 'cell' | 'occupant' | undefined;
  /** Initial population. Not allowed for cells, whose number is the grid's size. */
  count?: Expression | undefined;
  attributes?: Record<Name, AttributeSpec> | undefined;
  /** Actions run once when an agent is created, after its attributes have their initial values. */
  initialize?: Action[] | undefined;
  rules?: RuleSpec[] | undefined;
  /** The order agents act in each tick. Default `shuffled`. */
  order?: 'shuffled' | 'sequential' | undefined;
  /** Default `byAgent`. */
  schedule?: 'byAgent' | 'byRule' | undefined;
  style?: StyleSpec | undefined;
}
const agent: z.ZodType<AgentSpec> = z.strictObject({
  space: name.optional(),
  as: z.enum(['cell', 'occupant']).optional(),
  count: expression.optional(),
  attributes: z.record(name, attribute).optional(),
  initialize: actions.optional(),
  rules: z.array(rule).optional(),
  order: z.enum(['shuffled', 'sequential']).optional(),
  schedule: z.enum(['byAgent', 'byRule']).optional(),
  style: style.optional(),
  ...label,
});

/** Where agents live. Sizes are expressions so they can depend on parameters. */
export type SpaceSpec = Labelled &
  (
    | {
        kind: 'grid';
        width: Expression;
        height: Expression;
        /** Default true. */
        wrap?: boolean | undefined;
        /** Default `moore`. */
        neighborhood?: 'moore' | 'vonNeumann' | undefined;
        /** Default false. */
        multiOccupancy?: boolean | undefined;
      }
    | {
        kind: 'continuous';
        width: Expression;
        height: Expression;
        /** Default true. */
        wrap?: boolean | undefined;
      }
    | {
        kind: 'network';
        /** The agent type whose members the links join. */
        nodes: Name;
        /** Default false. */
        directed?: boolean | undefined;
        /**
         * The links to start with. `ring` joins each agent to `k` on each
         * side; `random` joins each pair with `probability`; `smallWorld` is
         * a ring with each link rewired with `probability`. Default `none`.
         */
        initial?:
          | { topology: 'none' }
          | { topology: 'ring'; k: Expression }
          | { topology: 'random'; probability: Expression }
          | { topology: 'smallWorld'; k: Expression; probability: Expression }
          | undefined;
      }
  );
const space: z.ZodType<SpaceSpec> = z.union([
  z.strictObject({
    kind: z.literal('grid'),
    width: expression,
    height: expression,
    wrap: z.boolean().optional(),
    neighborhood: z.enum(['moore', 'vonNeumann']).optional(),
    multiOccupancy: z.boolean().optional(),
    ...label,
  }),
  z.strictObject({
    kind: z.literal('continuous'),
    width: expression,
    height: expression,
    wrap: z.boolean().optional(),
    ...label,
  }),
  z.strictObject({
    kind: z.literal('network'),
    nodes: name,
    directed: z.boolean().optional(),
    initial: z
      .union([
        z.strictObject({ topology: z.literal('none') }),
        z.strictObject({ topology: z.literal('ring'), k: expression }),
        z.strictObject({ topology: z.literal('random'), probability: expression }),
        z.strictObject({
          topology: z.literal('smallWorld'),
          k: expression,
          probability: expression,
        }),
      ])
      .optional(),
    ...label,
  }),
]);

// ──────────────────────────────── Views ────────────────────────────────

/**
 * A chart of recorded data. Series are named `<agentType>.<attribute>.<statistic>`
 * for numbers (for example `walker.wealth.mean`), `<agentType>.<attribute>` for
 * booleans, `<agentType>.<attribute>.<state>` for states, and `<agentType>.count`
 * for the population of a type. A view of each space is always shown and needs
 * no declaration.
 */
export type ChartSpec =
  | { kind: 'timeSeries'; title: string; series: string[] }
  | { kind: 'bars'; title: string; series: string[] };
const chart: z.ZodType<ChartSpec> = z.strictObject({
  kind: z.enum(['timeSeries', 'bars']),
  title: z.string().min(1),
  series: z.array(z.string()).min(1),
});

// ──────────────────────────────── Model ────────────────────────────────

/** The version of the format this package reads and writes. */
export const SCHEMA_VERSION = 1;

/** A complete model, as data. */
export interface ModelSpec {
  schemaVersion: typeof SCHEMA_VERSION;
  name: string;
  description?: string | undefined;
  parameters?: Record<Name, ParameterSpec> | undefined;
  spaces?: Record<Name, SpaceSpec> | undefined;
  /** Agent types. They step in the order listed here. */
  agents: Record<Name, AgentSpec>;
  charts?: ChartSpec[] | undefined;
  /** The run ends when this becomes true, checked after every tick. */
  stopWhen?: Expression | undefined;
}

/** Validates the structure of a model. Use `parseModel` for friendlier errors. */
export const modelSchema: z.ZodType<ModelSpec> = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  name: z.string().min(1),
  description: z.string().optional(),
  parameters: z.record(name, parameter).optional(),
  spaces: z.record(name, space).optional(),
  agents: z.record(name, agent),
  charts: z.array(chart).optional(),
  stopWhen: expression.optional(),
});

/** A problem found in a model, with the path of the offending part. */
export interface Diagnostic {
  /** For example `agents.walker.rules[0].do[1].to`. */
  path: string;
  message: string;
}

/** Thrown by `parseModel` when input does not fit the format. */
export class ModelFormatError extends Error {
  override readonly name = 'ModelFormatError';
  constructor(readonly diagnostics: readonly Diagnostic[]) {
    super(
      `The model has ${diagnostics.length} problem${diagnostics.length === 1 ? '' : 's'}:\n` +
        diagnostics.map((d) => `  ${d.path || '(model)'}: ${d.message}`).join('\n'),
    );
  }
}

function formatPath(path: readonly PropertyKey[]): string {
  let text = '';
  for (const part of path) {
    text += typeof part === 'number' ? `[${part}]` : text ? `.${String(part)}` : String(part);
  }
  return text;
}

/**
 * Validates the structure of untrusted input, returning it typed as a
 * {@link ModelSpec} or throwing a {@link ModelFormatError} that lists every
 * problem. This checks shape only; `checkModel` checks meaning.
 */
export function parseModel(input: unknown): ModelSpec {
  const result = modelSchema.safeParse(input);
  if (result.success) return result.data;
  throw new ModelFormatError(
    result.error.issues.map((issue) => ({
      path: formatPath(issue.path),
      message: issue.message,
    })),
  );
}

/** The JSON Schema of the format, for editors and other tools. */
export function modelJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(modelSchema, { unrepresentable: 'any' }) as Record<string, unknown>;
}
