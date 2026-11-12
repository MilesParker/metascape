// SPDX-License-Identifier: EPL-2.0

interface ParameterBase {
  /** Display name; defaults to the parameter's key. */
  readonly label?: string;
  readonly description?: string;
}

export interface IntParameter extends ParameterBase {
  readonly type: 'int';
  readonly default: number;
  readonly min?: number;
  readonly max?: number;
}

export interface RealParameter extends ParameterBase {
  readonly type: 'real';
  readonly default: number;
  readonly min?: number;
  readonly max?: number;
}

export interface BooleanParameter extends ParameterBase {
  readonly type: 'boolean';
  readonly default: boolean;
}

export interface ChoiceParameter<Option extends string = string> extends ParameterBase {
  readonly type: 'choice';
  readonly options: readonly Option[];
  readonly default: Option;
}

export interface TextParameter extends ParameterBase {
  readonly type: 'text';
  readonly default: string;
}

export type Parameter =
  IntParameter | RealParameter | BooleanParameter | ChoiceParameter | TextParameter;

/** The declared, typed parameters of a model, keyed by name. */
export type ParameterSchema = Readonly<Record<string, Parameter>>;

/** The value type a single parameter declaration resolves to. */
export type ParameterValue<P extends Parameter> =
  P extends ChoiceParameter<infer Option>
    ? Option
    : P extends BooleanParameter
      ? boolean
      : P extends TextParameter
        ? string
        : number;

/** The resolved values for a schema: what a model reads while it runs. */
export type ParameterValues<S extends ParameterSchema> = {
  readonly [K in keyof S]: ParameterValue<S[K]>;
};

type NumericOptions = Omit<IntParameter, 'type' | 'default'>;

/** An integer parameter. */
export const int = (defaultValue: number, options: NumericOptions = {}): IntParameter => ({
  type: 'int',
  default: defaultValue,
  ...options,
});

/** A real-valued parameter. */
export const real = (defaultValue: number, options: NumericOptions = {}): RealParameter => ({
  type: 'real',
  default: defaultValue,
  ...options,
});

/** A true/false parameter. */
export const bool = (defaultValue: boolean, options: ParameterBase = {}): BooleanParameter => ({
  type: 'boolean',
  default: defaultValue,
  ...options,
});

/** A parameter taking one of a fixed list of names. */
export const choice = <const Options extends readonly string[]>(
  options: Options,
  defaultValue: Options[number],
  extra: ParameterBase = {},
): ChoiceParameter<Options[number]> => ({
  type: 'choice',
  options,
  default: defaultValue,
  ...extra,
});

/** A free-text parameter. */
export const text = (defaultValue: string, options: ParameterBase = {}): TextParameter => ({
  type: 'text',
  default: defaultValue,
  ...options,
});

/** Thrown when supplied parameter values do not fit a model's schema. */
export class ParameterError extends Error {
  override readonly name = 'ParameterError';
}

function check(name: string, parameter: Parameter, value: unknown): void {
  const fail = (expected: string): never => {
    throw new ParameterError(`Parameter "${name}": expected ${expected}, got ${String(value)}`);
  };
  switch (parameter.type) {
    case 'int':
    case 'real': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return fail('a finite number');
      if (parameter.type === 'int' && !Number.isInteger(value)) return fail('an integer');
      if (parameter.min !== undefined && value < parameter.min) fail(`at least ${parameter.min}`);
      if (parameter.max !== undefined && value > parameter.max) fail(`at most ${parameter.max}`);
      return;
    }
    case 'boolean':
      if (typeof value !== 'boolean') fail('true or false');
      return;
    case 'choice':
      if (typeof value !== 'string' || !parameter.options.includes(value)) {
        fail(`one of ${parameter.options.join(', ')}`);
      }
      return;
    case 'text':
      if (typeof value !== 'string') fail('text');
      return;
  }
}

/**
 * Combines a schema's defaults with supplied overrides and validates the result.
 * Unknown names, wrong types and out-of-range values throw a {@link ParameterError}.
 */
export function resolveParameters<S extends ParameterSchema>(
  schema: S,
  supplied: Partial<ParameterValues<S>> = {},
): ParameterValues<S> {
  for (const name of Object.keys(supplied)) {
    if (!Object.hasOwn(schema, name)) {
      throw new ParameterError(`Unknown parameter "${name}"`);
    }
  }
  const values: Record<string, unknown> = {};
  for (const [name, parameter] of Object.entries(schema)) {
    const given = (supplied as Record<string, unknown>)[name];
    const value = given === undefined ? parameter.default : given;
    check(name, parameter, value);
    values[name] = value;
  }
  return Object.freeze(values) as ParameterValues<S>;
}
