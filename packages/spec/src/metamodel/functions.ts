// SPDX-License-Identifier: EPL-2.0
//
// Implementations of the core function library (./core-library.ts), keyed by
// function ID. Meanings follow the Escape and Ascape code generators of the
// Eclipse Agent Modeling Platform (org.eclipse.amp.amf.gen.ascape and
// gen.escape, made available under the Eclipse Public License) and the Ascape
// runtime they generate code for. Where the library's descriptions, the
// generators and the runtime disagree, the choice made is recorded under
// "Ambiguities" in docs/metamodel-review.md.
import type { Color, Random } from '@metascape/engine';
import type { LibraryFunction, PrototypeType } from './types';

/** A value that flows between acts: a boolean, a number, or a symbol or state option (a string). */
export type Datum = boolean | number | string;

/**
 * The type of a value as the interpreter works it out before a model runs: a
 * prototype type, `state:owner.attribute` for an option of a state attribute,
 * or `none` for a function without a result.
 */
export type ValueType = PrototypeType | `state:${string}` | 'none';

/** What a function is told about one of its inputs before the model runs. */
export interface InputInfo {
  /** The type of the value, or, for a multi-value, the type of the attributes it lists. */
  readonly type: ValueType;
  /** For a multi-value input: the options of each attribute it lists that is a state attribute. */
  readonly options?: readonly (readonly string[] | undefined)[];
}

/** What a function is told about a call before the model runs. */
export interface CallInfo {
  readonly inputs: readonly InputInfo[];
  /** The options of a state attribute, from a `state:owner.attribute` type. */
  optionsOf(type: ValueType): readonly string[] | undefined;
}

/** The shapes a style can draw. */
export type Shape = 'oval' | 'rectangle' | 'marker' | 'marker2' | 'marker3';

/** One thing a style draws: a shape, filled or outlined, in a colour. */
export interface Mark {
  readonly shape: Shape;
  readonly color: Color;
  readonly fill: boolean;
  /** How far the shape is shrunk, in twentieths of the agent's size (`shapeInset`). */
  readonly inset: number;
}

/**
 * What a style's flow has declared so far: the current colour and shape, and
 * the marks made. A style's acts declare how an agent looks; the graphic
 * functions record into this as the flow reaches them.
 */
export class StyleAccumulator {
  color: Color = 0x000000;
  shape: Shape = 'rectangle';
  inset = 0;
  readonly marks: Mark[] = [];

  draw(fill: boolean): void {
    this.marks.push({ shape: this.shape, color: this.color, fill, inset: this.inset });
  }
}

/** What a function can use while the model runs. */
export interface CallContext {
  /** The random stream of the acting agent. */
  readonly random: Random;
  /** The current period. */
  readonly period: number;
  /** Present while a style is being worked out. */
  readonly style: StyleAccumulator | undefined;
}

/** An argument: a value, or for a multi-value input, the values of the attributes it lists. */
export type Argument = Datum | readonly Datum[];

/** A function, ready to call with its arguments. */
export type Call = (args: readonly Argument[], context: CallContext) => Datum | undefined;

/**
 * Query terms that say where to look and how many to choose. They are not
 * called like other functions: a selection works them out together (see the
 * interpreter). `distance` is the one spatial function with a value.
 */
export type SpatialTerm =
  | 'nearest'
  | 'toward'
  | 'within'
  | 'neighbor'
  | 'includeSelf'
  | 'here'
  | 'available'
  | 'distance'
  | 'away'
  | 'minimize'
  | 'maximize'
  | 'location2D'
  | 'all';

/** The implementation of a library function. */
export type FunctionImplementation =
  | { readonly kind: 'value'; compile(call: CallInfo): Call }
  | { readonly kind: 'spatial'; readonly term: SpatialTerm };

// ───────────────────────────── Types ─────────────────────────────

const isInteger = (type: ValueType | undefined) => type === 'integer';

/**
 * Whether a call works in integers: every input is an integer, or a numeric
 * constant (such as `unit`) beside integers, which takes the type of where it
 * is used.
 */
const integerCall = (inputs: readonly InputInfo[]) =>
  inputs.some((input) => isInteger(input.type)) &&
  inputs.every((input) => isInteger(input.type) || input.type === 'numeric');

/**
 * The type of a function's result, as the generators work it out (`types.ext`,
 * `resultType`): a logical function gives a boolean; a function with a
 * concrete output type gives that; otherwise the inputs decide.
 */
export function resultType(fn: LibraryFunction, inputs: readonly ValueType[]): ValueType {
  if (fn.kind === 'logicalOperator' || fn.kind === 'genericLogical') return 'boolean';
  if (fn.kind === 'genericFunction') {
    const output = fn.output?.type;
    if (output === undefined) return 'none';
    if (output !== 'numeric' && output !== 'generic') return output;
  }
  return combineTypes(inputs);
}

/**
 * The type of a combination of values: symbol if any is a symbol; boolean if
 * all are booleans; real if any is real; integer if all are integers;
 * otherwise numeric. Values of one state keep that state.
 */
export function combineTypes(types: readonly ValueType[]): ValueType {
  const first = types[0];
  if (first?.startsWith('state:') && types.every((t) => t === first)) return first;
  if (types.includes('symbol')) return 'symbol';
  if (types.includes('boolean')) return types.every((t) => t === 'boolean') ? 'boolean' : 'generic';
  if (types.includes('real')) return 'real';
  if (types.length > 0 && types.every((t) => t === 'integer')) return 'integer';
  return 'numeric';
}

// ───────────────────────────── Helpers ─────────────────────────────

const num = (value: Argument | undefined): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  throw new TypeError(`Expected a number, found ${JSON.stringify(value)}`);
};

const bool = (value: Argument | undefined): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  throw new TypeError(`Expected a boolean, found ${JSON.stringify(value)}`);
};

const list = (value: Argument | undefined): readonly Datum[] =>
  Array.isArray(value) ? value : value === undefined ? [] : [value as Datum];

/** A function of its arguments alone. */
const pure = (fn: (args: readonly Argument[]) => Datum): FunctionImplementation => ({
  kind: 'value',
  compile: () => (args) => fn(args),
});

/** A function of one real number. */
const math1 = (fn: (a: number) => number) => pure((args) => fn(num(args[0])));
/** A function of two real numbers. */
const math2 = (fn: (a: number, b: number) => number) =>
  pure((args) => fn(num(args[0]), num(args[1])));

/** A numeric operator: integer arithmetic when every input is an integer, as in Java. */
const arithmetic = (
  real: (a: number, b: number) => number,
  integer: (a: number, b: number) => number = (a, b) => Math.trunc(real(a, b)),
): FunctionImplementation => ({
  kind: 'value',
  compile: (call) => {
    return integerCall(call.inputs)
      ? (args) => integer(num(args[0]), num(args[1]))
      : (args) => real(num(args[0]), num(args[1]));
  },
});

const spatial = (term: SpatialTerm): FunctionImplementation => ({ kind: 'spatial', term });

/** A drawing function: it records into the style being worked out, and has no value. */
const graphic = (draw: (style: StyleAccumulator, args: readonly Argument[]) => void) =>
  ({
    kind: 'value',
    compile: () => (args, context) => {
      if (context.style) draw(context.style, args);
      return undefined;
    },
  }) satisfies FunctionImplementation;

/** A named colour, with the value `java.awt.Color` gives it, as the generators use. */
const named = (color: Color) =>
  graphic((style) => {
    style.color = color;
  });

const shape = (value: Shape) =>
  graphic((style) => {
    style.shape = value;
    style.inset = 0;
  });

/** Java's `Math.rint`: the nearest integer, ties to even. */
function rint(a: number): number {
  if (!Number.isFinite(a)) return a;
  const floor = Math.floor(a);
  const diff = a - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Java's `Math.ulp` for doubles. */
function ulp(a: number): number {
  if (!Number.isFinite(a)) return Number.isNaN(a) ? Number.NaN : Number.POSITIVE_INFINITY;
  const x = Math.abs(a);
  if (x === Number.MAX_VALUE) return 2 ** 971;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  view.setBigUint64(0, view.getBigUint64(0) + 1n);
  return view.getFloat64(0) - x;
}

/** The position of each state's current option, counted across all the states' options, after a first base slot. */
function additiveSlots(
  states: readonly Datum[],
  options: readonly (readonly string[] | undefined)[],
): number[] {
  const slots: number[] = [];
  let offset = 1;
  states.forEach((value, index) => {
    const choices = options[index] ?? [];
    const position = choices.indexOf(String(value));
    if (position >= 0) slots.push(offset + position);
    offset += choices.length;
  });
  return slots;
}

/** The position of the states' current options in the cross of all their options, the first state varying slowest. */
function crossSlot(
  states: readonly Datum[],
  options: readonly (readonly string[] | undefined)[],
): number {
  let slot = 0;
  states.forEach((value, index) => {
    const choices = options[index] ?? [];
    slot = slot * Math.max(choices.length, 1) + Math.max(choices.indexOf(String(value)), 0);
  });
  return slot;
}

/**
 * A distribution: its first input lists the state attributes its parameters
 * vary by, and each further input lists the attributes holding a parameter
 * (R22). An additive parameter is its first attribute plus one attribute per
 * option of each state, in order; a cross parameter has one attribute per
 * combination of options. A parameter given as a single attribute does not
 * vary.
 */
function distribution(
  additive: boolean,
  draw: (parameters: readonly number[], random: Random) => number,
): FunctionImplementation {
  return {
    kind: 'value',
    compile: (call) => {
      const options = call.inputs[0]?.options ?? [];
      const parameter = (values: readonly Datum[], states: readonly Datum[]): number => {
        if (values.length <= 1) return num(values[0] ?? 0);
        if (additive) {
          let total = num(values[0]);
          for (const slot of additiveSlots(states, options)) total += num(values[slot] ?? 0);
          return total;
        }
        return num(values[crossSlot(states, options)] ?? 0);
      };
      return (args, context) => {
        const states = list(args[0]);
        const parameters = args.slice(1).map((values) => parameter(list(values), states));
        return draw(parameters, context.random);
      };
    },
  };
}

const uniform = ([min = 0, max = 0]: readonly number[], random: Random) =>
  min + random.float() * (max - min);

// ───────────────────────────── The library ─────────────────────────────

/**
 * The implementations of the core library's functions, keyed by function ID.
 * Every function in {@link coreLibrary} has one.
 */
export const coreFunctions: Readonly<Record<string, FunctionImplementation>> = {
  // Logical operators.
  not: pure((args) => !bool(args[0])),
  equal: pure((args) => args[0] === args[1]),
  identical: pure((args) => args[0] === args[1]),
  different: pure((args) => args[0] !== args[1]),
  greater: pure((args) => num(args[0]) > num(args[1])),
  lesser: pure((args) => num(args[0]) < num(args[1])),
  greaterorEqual: pure((args) => num(args[0]) >= num(args[1])),
  lesserorEqual: pure((args) => num(args[0]) <= num(args[1])),
  true: pure(() => true),
  false: pure(() => false),
  identity: pure((args) => bool(args[0])),

  // Numeric operators. Integer division and remainder truncate, as in Java.
  neg: pure((args) => -num(args[0])),
  add: arithmetic((a, b) => a + b),
  sub: arithmetic((a, b) => a - b),
  mul: arithmetic(
    (a, b) => a * b,
    (a, b) => Math.trunc(a * b),
  ),
  div: arithmetic(
    (a, b) => a / b,
    (a, b) => {
      if (b === 0) throw new RangeError('Integer division by zero');
      return Math.trunc(a / b);
    },
  ),
  pow: arithmetic(
    (a, b) => a ** b,
    (a, b) => Math.trunc(a ** b),
  ),
  mod: arithmetic(
    (a, b) => a % b,
    (a, b) => {
      if (b === 0) throw new RangeError('Integer remainder by zero');
      return a % b;
    },
  ),
  increment: pure((args) => num(args[0]) + 1),
  decrement: pure((args) => num(args[0]) - 1),
  unit: pure(() => 1),
  zero: pure(() => 0),
  // The interpreter gives `original` the value its input had when the agent started.
  original: pure((args) => num(args[0])),

  // Spatial query terms, worked out by selections.
  nearest: spatial('nearest'),
  toward: spatial('toward'),
  within: spatial('within'),
  neighbor: spatial('neighbor'),
  includeSelf: spatial('includeSelf'),
  here: spatial('here'),
  available: spatial('available'),
  distance: spatial('distance'),
  away: spatial('away'),
  minimize: spatial('minimize'),
  maximize: spatial('maximize'),
  location2D: spatial('location2D'),
  all: spatial('all'),

  // Random functions, as Ascape's `RandomFunctions`.
  randomInRange: {
    kind: 'value',
    compile: (call) => {
      // Integers: both ends inclusive. Reals: the upper end exclusive.
      return integerCall(call.inputs)
        ? (args, { random }) => {
            const low = num(args[0]);
            const high = num(args[1]);
            return high < low ? low : random.int(low, high + 1);
          }
        : (args, { random }) => {
            const low = num(args[0]);
            return low + random.float() * (num(args[1]) - low);
          };
    },
  },
  randomToLimit: {
    kind: 'value',
    compile: (call) =>
      // As Ascape's `randomToLimit`, `nextInt(limit)`: 0 inclusive to the limit exclusive.
      isInteger(call.inputs[0]?.type)
        ? (args, { random }) => {
            const limit = num(args[0]);
            if (limit <= 0)
              throw new RangeError(`randomToLimit needs a positive limit, got ${limit}`);
            return random.int(0, limit);
          }
        : (args, { random }) => random.float() * num(args[0]),
  },
  randomUnit: {
    kind: 'value',
    compile:
      () =>
      (_args, { random }) =>
        random.float(),
  },
  randomIs: {
    kind: 'value',
    compile:
      () =>
      (_args, { random }) =>
        random.chance(0.5),
  },
  randomState: {
    kind: 'value',
    compile: (call) => {
      const options = call.optionsOf(call.inputs[0]?.type ?? 'none');
      if (!options || options.length === 0) {
        throw new TypeError('randomState takes the value of a state attribute');
      }
      return (_args, { random }) => random.pick(options);
    },
  },

  // Graphics: colours as java.awt.Color, which the generators used.
  shapeOval: shape('oval'),
  shapeRectangle: shape('rectangle'),
  shapeMarker: shape('marker'),
  shapeMarker2: shape('marker2'),
  shapeMarker3: shape('marker3'),
  shapeInset: graphic((style, args) => {
    style.inset += num(args[0]);
  }),
  colorRGB: graphic((style, args) => {
    const channel = (value: Argument | undefined) =>
      Math.round(Math.max(0, Math.min(1, num(value))) * 255);
    style.color = (channel(args[0]) << 16) | (channel(args[1]) << 8) | channel(args[2]);
  }),
  colorRed: named(0xff0000),
  colorYellow: named(0xffff00),
  colorBlue: named(0x0000ff),
  colorOrange: named(0xffc800),
  colorGreen: named(0x00ff00),
  colorPurple: named(0x800080),
  colorBlack: named(0x000000),
  colorWhite: named(0xffffff),
  colorGray: named(0x808080),
  graphicOutline: graphic((style) => style.draw(false)),
  graphicFill: graphic((style) => style.draw(true)),

  // Time.
  timeNow: {
    kind: 'value',
    compile:
      () =>
      (_args, { period }) =>
        period,
  },

  // Math, as java.lang.Math.
  sin: math1(Math.sin),
  cos: math1(Math.cos),
  tan: math1(Math.tan),
  asin: math1(Math.asin),
  acos: math1(Math.acos),
  atan: math1(Math.atan),
  toRadians: math1((a) => (a * Math.PI) / 180),
  toDegrees: math1((a) => (a * 180) / Math.PI),
  exp: math1(Math.exp),
  log: math1(Math.log),
  log10: math1(Math.log10),
  squareRoot: math1(Math.sqrt),
  cbrt: math1(Math.cbrt),
  IEEEremainder: math2((a, b) => a - b * rint(a / b)),
  ceil: math1(Math.ceil),
  floor: math1(Math.floor),
  rint: math1(rint),
  atan2: math2(Math.atan2),
  abs: math1(Math.abs),
  max: math2(Math.max),
  min: math2(Math.min),
  ulp: math1(ulp),
  signum: math1((a) => (Number.isNaN(a) || a === 0 ? a : Math.sign(a))),
  sinh: math1(Math.sinh),
  cosh: math1(Math.cosh),
  tanh: math1(Math.tanh),
  hypotuneuse: math2(Math.hypot),
  expm1: math1(Math.expm1),
  log1p: math1(Math.log1p),

  // Distributions (R22).
  uniformCrossDistribution: distribution(false, uniform),
  uniformAdditiveDistribution: distribution(true, uniform),
  crossDistribution: distribution(false, ([value = 0]) => value),
  additiveDistribution: distribution(true, ([factor = 0]) => factor),
};
