// SPDX-License-Identifier: EPL-2.0
//
// Generated code for calls of the core library's value functions
// (../functions.ts), by function ID. Each gives the same value as the
// function's implementation, and evaluates each of its arguments once, in
// order, as the interpreter does before calling. A call of a function not
// here, or whose implementation was replaced, calls the implementation.
import type { CallInfo } from '../functions';
import { code, type Code } from './emit';

interface Template {
  /** How many arguments it takes: a call with another number calls the implementation. */
  readonly arity: number;
  /** Whether it draws from the random stream (so may not be repeated or reordered). */
  readonly random?: boolean;
  readonly emit: (args: readonly Code[], info: CallInfo) => Code;
}

const isInteger = (info: CallInfo, i: number) => info.inputs[i]?.type === 'integer';

/** As `integerCall` in ../functions.ts. */
const integerCall = (info: CallInfo) =>
  info.inputs.some((input) => input.type === 'integer') &&
  info.inputs.every((input) => input.type === 'integer' || input.type === 'numeric');

const of0 = (text: Code): Template => ({ arity: 0, emit: () => text });

const compare = (emit: (a: Code, b: Code) => Code): Template => ({
  arity: 2,
  emit: ([a, b]) => emit(a!, b!),
});

const math1 = (emit: (a: Code) => Code): Template => ({ arity: 1, emit: ([a]) => emit(a!) });

const arithmetic = (
  real: (a: Code, b: Code) => Code,
  integer: (a: Code, b: Code) => Code = (a, b) => code`Math.trunc(${real(a, b)})`,
): Template => ({
  arity: 2,
  emit: ([a, b], info) => (integerCall(info) ? integer(a!, b!) : real(a!, b!)),
});

/** The templates, by the ID of the core function each stands for. */
export const TEMPLATES: ReadonlyMap<string, Template> = new Map<string, Template>([
  ['not', math1((a) => code`!H.bool(${a})`)],
  ['equal', compare((a, b) => code`(${a} === ${b})`)],
  ['identical', compare((a, b) => code`(${a} === ${b})`)],
  ['different', compare((a, b) => code`(${a} !== ${b})`)],
  ['greater', compare((a, b) => code`(N(${a}) > N(${b}))`)],
  ['lesser', compare((a, b) => code`(N(${a}) < N(${b}))`)],
  ['greaterorEqual', compare((a, b) => code`(N(${a}) >= N(${b}))`)],
  ['lesserorEqual', compare((a, b) => code`(N(${a}) <= N(${b}))`)],
  ['true', of0(code`true`)],
  ['false', of0(code`false`)],
  ['identity', math1((a) => code`H.bool(${a})`)],

  ['neg', math1((a) => code`(-N(${a}))`)],
  ['add', arithmetic((a, b) => code`(N(${a}) + N(${b}))`)],
  ['sub', arithmetic((a, b) => code`(N(${a}) - N(${b}))`)],
  [
    'mul',
    arithmetic(
      (a, b) => code`(N(${a}) * N(${b}))`,
      (a, b) => code`Math.trunc(N(${a}) * N(${b}))`,
    ),
  ],
  [
    'div',
    arithmetic(
      (a, b) => code`(N(${a}) / N(${b}))`,
      (a, b) => code`H.integerDivision(N(${a}), N(${b}))`,
    ),
  ],
  [
    'pow',
    arithmetic(
      (a, b) => code`(N(${a}) ** N(${b}))`,
      (a, b) => code`Math.trunc(N(${a}) ** N(${b}))`,
    ),
  ],
  [
    'mod',
    arithmetic(
      (a, b) => code`(N(${a}) % N(${b}))`,
      (a, b) => code`H.integerRemainder(N(${a}), N(${b}))`,
    ),
  ],
  ['increment', math1((a) => code`(N(${a}) + 1)`)],
  ['decrement', math1((a) => code`(N(${a}) - 1)`)],
  ['unit', of0(code`1`)],
  ['zero', of0(code`0`)],

  [
    'randomInRange',
    {
      arity: 2,
      random: true,
      emit: ([a, b], info) =>
        integerCall(info)
          ? code`H.randomInRangeInteger(R, N(${a!}), N(${b!}))`
          : code`H.randomInRangeReal(R, N(${a!}), N(${b!}))`,
    },
  ],
  [
    'randomToLimit',
    {
      arity: 1,
      random: true,
      emit: ([a], info) =>
        isInteger(info, 0)
          ? code`H.randomToLimitInteger(R, N(${a!}))`
          : code`H.randomToLimitReal(R, N(${a!}))`,
    },
  ],
  ['randomUnit', { arity: 0, random: true, emit: () => code`R.float()` }],
  ['randomIs', { arity: 0, random: true, emit: () => code`R.chance(0.5)` }],

  ['timeNow', of0(code`S.period`)],

  ['sin', math1((a) => code`Math.sin(N(${a}))`)],
  ['cos', math1((a) => code`Math.cos(N(${a}))`)],
  ['tan', math1((a) => code`Math.tan(N(${a}))`)],
  ['asin', math1((a) => code`Math.asin(N(${a}))`)],
  ['acos', math1((a) => code`Math.acos(N(${a}))`)],
  ['atan', math1((a) => code`Math.atan(N(${a}))`)],
  ['toRadians', math1((a) => code`((N(${a}) * Math.PI) / 180)`)],
  ['toDegrees', math1((a) => code`((N(${a}) * 180) / Math.PI)`)],
  ['exp', math1((a) => code`Math.exp(N(${a}))`)],
  ['log', math1((a) => code`Math.log(N(${a}))`)],
  ['log10', math1((a) => code`Math.log10(N(${a}))`)],
  ['squareRoot', math1((a) => code`Math.sqrt(N(${a}))`)],
  ['cbrt', math1((a) => code`Math.cbrt(N(${a}))`)],
  ['ceil', math1((a) => code`Math.ceil(N(${a}))`)],
  ['floor', math1((a) => code`Math.floor(N(${a}))`)],
  ['abs', math1((a) => code`Math.abs(N(${a}))`)],
  ['sinh', math1((a) => code`Math.sinh(N(${a}))`)],
  ['cosh', math1((a) => code`Math.cosh(N(${a}))`)],
  ['tanh', math1((a) => code`Math.tanh(N(${a}))`)],
  ['expm1', math1((a) => code`Math.expm1(N(${a}))`)],
  ['log1p', math1((a) => code`Math.log1p(N(${a}))`)],
  ['atan2', compare((a, b) => code`Math.atan2(N(${a}), N(${b}))`)],
  ['max', compare((a, b) => code`Math.max(N(${a}), N(${b}))`)],
  ['min', compare((a, b) => code`Math.min(N(${a}), N(${b}))`)],
  ['hypotuneuse', compare((a, b) => code`Math.hypot(N(${a}), N(${b}))`)],
]);

/**
 * Core functions called through their implementation that are pure: their
 * value depends on their arguments alone, so a selection may work them out
 * for each candidate as often as it likes.
 */
export const PURE_IMPLEMENTATIONS: ReadonlySet<string> = new Set([
  'rint',
  'ulp',
  'signum',
  'IEEEremainder',
]);
