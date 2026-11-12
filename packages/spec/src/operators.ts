// SPDX-License-Identifier: EPL-2.0
import { mix, rgb, type Random } from '@metascape/engine';
import type { Operator } from './schema';
import { BOOLEAN, COLOR, INT, isNumeric, REAL, type Type } from './types';

/**
 * What an operator accepts in one argument position:
 * - `number`: an `int` or a `real`
 * - `int`: an `int` only (use `floor`, `ceil` or `round` to convert a real)
 * - `boolean`, `color`: exactly that type
 * - `agent`: an agent of any type
 * - `any`: any value (the operator checks how its arguments relate)
 */
export type ArgumentKind = 'number' | 'int' | 'boolean' | 'color' | 'agent' | 'any';

/**
 * The type an operator produces:
 * - `int`, `real`, `boolean`, `color`: always that type
 * - `numeric`: `int` if every argument is an `int`, otherwise `real`
 * - `branch`: the type of the `then` and `else` arguments of `if`
 */
export type ResultKind = 'int' | 'real' | 'boolean' | 'color' | 'numeric' | 'branch';

/** The arguments of a numeric operator: unused positions are 0. */
type NumericImplementation = (a: number, b: number, c: number, random: Random) => number;
type TestImplementation = (a: number, b: number, c: number, random: Random) => boolean;

/** The signature and implementation of one operator. */
export interface OperatorSignature {
  /** The kinds of the arguments, in order. */
  readonly args: readonly ArgumentKind[];
  /** When true, the last argument kind may repeat: the operator takes at least `args.length` arguments. */
  readonly variadic?: boolean;
  readonly result: ResultKind;
  /** For numeric results. Variadic operators are applied pairwise, left to right. */
  readonly number?: NumericImplementation;
  /** For boolean results computed from numbers. */
  readonly test?: TestImplementation;
  /**
   * True for operators the compiler implements itself because they short-circuit
   * (`and`, `or`, `if`), compare values of any type (`eq`, `ne`, `not`) or need
   * the model's spaces (`distance`).
   */
  readonly special?: boolean;
  /** True if the operator draws from the acting agent's random stream. */
  readonly random?: boolean;
  /** One line for documentation and error messages. */
  readonly summary: string;
}

const floorMod = (a: number, b: number): number => ((a % b) + b) % b;

/**
 * Every operator of the format: argument kinds, result type and implementation.
 * The checker and the compiler both read this table.
 */
export const OPERATORS: { readonly [O in Operator]: OperatorSignature } = {
  add: {
    args: ['number', 'number'],
    variadic: true,
    result: 'numeric',
    number: (a, b) => a + b,
    summary: 'add(a, b, ...): the sum',
  },
  sub: {
    args: ['number', 'number'],
    result: 'numeric',
    number: (a, b) => a - b,
    summary: 'sub(a, b): a minus b',
  },
  mul: {
    args: ['number', 'number'],
    variadic: true,
    result: 'numeric',
    number: (a, b) => a * b,
    summary: 'mul(a, b, ...): the product',
  },
  div: {
    args: ['number', 'number'],
    result: 'real',
    number: (a, b) => a / b,
    summary: 'div(a, b): a divided by b, always a real',
  },
  mod: {
    args: ['number', 'number'],
    result: 'numeric',
    number: floorMod,
    summary: 'mod(a, b): the remainder of a / b, with the sign of b',
  },
  pow: {
    args: ['number', 'number'],
    result: 'real',
    number: (a, b) => a ** b,
    summary: 'pow(a, b): a to the power b, a real',
  },
  neg: { args: ['number'], result: 'numeric', number: (a) => -a, summary: 'neg(a): minus a' },
  abs: {
    args: ['number'],
    result: 'numeric',
    number: (a) => Math.abs(a),
    summary: 'abs(a): the absolute value',
  },
  min: {
    args: ['number', 'number'],
    variadic: true,
    result: 'numeric',
    number: (a, b) => Math.min(a, b),
    summary: 'min(a, b, ...): the smallest',
  },
  max: {
    args: ['number', 'number'],
    variadic: true,
    result: 'numeric',
    number: (a, b) => Math.max(a, b),
    summary: 'max(a, b, ...): the largest',
  },
  clamp: {
    args: ['number', 'number', 'number'],
    result: 'numeric',
    number: (x, lo, hi) => Math.min(Math.max(x, lo), hi),
    summary: 'clamp(x, lo, hi): x limited to lo..hi',
  },
  floor: {
    args: ['number'],
    result: 'int',
    number: (a) => Math.floor(a),
    summary: 'floor(a): the largest int not above a',
  },
  ceil: {
    args: ['number'],
    result: 'int',
    number: (a) => Math.ceil(a),
    summary: 'ceil(a): the smallest int not below a',
  },
  round: {
    args: ['number'],
    result: 'int',
    number: (a) => Math.round(a),
    summary: 'round(a): the nearest int, halves rounded up',
  },
  sqrt: {
    args: ['number'],
    result: 'real',
    number: (a) => Math.sqrt(a),
    summary: 'sqrt(a): the square root',
  },
  exp: { args: ['number'], result: 'real', number: (a) => Math.exp(a), summary: 'exp(a): e^a' },
  log: {
    args: ['number'],
    result: 'real',
    number: (a) => Math.log(a),
    summary: 'log(a): the natural logarithm',
  },
  sin: {
    args: ['number'],
    result: 'real',
    number: (a) => Math.sin(a),
    summary: 'sin(a): sine, a in radians',
  },
  cos: {
    args: ['number'],
    result: 'real',
    number: (a) => Math.cos(a),
    summary: 'cos(a): cosine, a in radians',
  },
  atan2: {
    args: ['number', 'number'],
    result: 'real',
    number: (y, x) => Math.atan2(y, x),
    summary: 'atan2(y, x): the angle of (x, y) in radians',
  },
  eq: { args: ['any', 'any'], result: 'boolean', special: true, summary: 'eq(a, b): a equals b' },
  ne: {
    args: ['any', 'any'],
    result: 'boolean',
    special: true,
    summary: 'ne(a, b): a differs from b',
  },
  lt: {
    args: ['number', 'number'],
    result: 'boolean',
    test: (a, b) => a < b,
    summary: 'lt(a, b): a < b',
  },
  le: {
    args: ['number', 'number'],
    result: 'boolean',
    test: (a, b) => a <= b,
    summary: 'le(a, b): a <= b',
  },
  gt: {
    args: ['number', 'number'],
    result: 'boolean',
    test: (a, b) => a > b,
    summary: 'gt(a, b): a > b',
  },
  ge: {
    args: ['number', 'number'],
    result: 'boolean',
    test: (a, b) => a >= b,
    summary: 'ge(a, b): a >= b',
  },
  and: {
    args: ['boolean', 'boolean'],
    variadic: true,
    result: 'boolean',
    special: true,
    summary: 'and(a, b, ...): all true (stops at the first false)',
  },
  or: {
    args: ['boolean', 'boolean'],
    variadic: true,
    result: 'boolean',
    special: true,
    summary: 'or(a, b, ...): any true (stops at the first true)',
  },
  not: { args: ['boolean'], result: 'boolean', special: true, summary: 'not(a): a is false' },
  if: {
    args: ['boolean', 'any', 'any'],
    result: 'branch',
    special: true,
    summary: 'if(condition, then, else): then if the condition holds, otherwise else',
  },
  random: {
    args: [],
    result: 'real',
    random: true,
    number: (_a, _b, _c, random) => random.float(),
    summary: 'random(): uniform in [0, 1)',
  },
  randomInt: {
    args: ['int', 'int'],
    result: 'int',
    random: true,
    number: (a, b, _c, random) => (b <= a ? a : a + random.int(0, b - a + 1)),
    summary: 'randomInt(a, b): an int in a..b inclusive (a if b <= a)',
  },
  randomReal: {
    args: ['number', 'number'],
    result: 'real',
    random: true,
    number: (a, b, _c, random) => a + random.float() * (b - a),
    summary: 'randomReal(a, b): uniform in [a, b)',
  },
  chance: {
    args: ['number'],
    result: 'boolean',
    random: true,
    test: (p, _b, _c, random) => random.chance(p),
    summary: 'chance(p): true with probability p',
  },
  distance: {
    args: ['agent', 'agent'],
    result: 'real',
    special: true,
    summary: 'distance(a, b): between two agents in the grid or continuous space they share',
  },
  rgb: {
    args: ['number', 'number', 'number'],
    result: 'color',
    number: (r, g, b) => rgb(r, g, b),
    summary: 'rgb(r, g, b): a colour from channels 0..255',
  },
  mix: {
    args: ['color', 'color', 'number'],
    result: 'color',
    number: (from, to, t) => mix(from, to, t),
    summary: 'mix(from, to, t): blends from (t = 0) to (t = 1)',
  },
};

/** Whether a value of type `type` fits an argument of kind `kind`. */
export function fitsArgument(kind: ArgumentKind, type: Type): boolean {
  switch (kind) {
    case 'number':
      return isNumeric(type);
    case 'int':
      return type.kind === 'int';
    case 'boolean':
      return type.kind === 'boolean';
    case 'color':
      return type.kind === 'color';
    case 'agent':
      return type.kind === 'agent';
    case 'any':
      return true;
  }
}

/** How an argument kind is named in messages. */
export function describeArgumentKind(kind: ArgumentKind): string {
  return kind === 'number' ? 'a number' : kind === 'any' ? 'a value' : `${article(kind)} ${kind}`;
}

const article = (word: string): string => (/^[aeiou]/.test(word) ? 'an' : 'a');

/**
 * The result type of an operator applied to arguments of the given types,
 * assuming the arguments fit. For `if`, `argTypes` are the condition, `then`
 * and `else` types.
 */
export function operatorResult(op: Operator, argTypes: readonly Type[]): Type {
  const signature = OPERATORS[op];
  switch (signature.result) {
    case 'int':
      return INT;
    case 'real':
      return REAL;
    case 'boolean':
      return BOOLEAN;
    case 'color':
      return COLOR;
    case 'numeric':
      return argTypes.every((type) => type.kind === 'int') ? INT : REAL;
    case 'branch': {
      const [, then, otherwise] = argTypes;
      if (!then || !otherwise) return then ?? otherwise ?? INT;
      if (isNumeric(then) && isNumeric(otherwise)) {
        return then.kind === 'int' && otherwise.kind === 'int' ? INT : REAL;
      }
      return then;
    }
  }
}
