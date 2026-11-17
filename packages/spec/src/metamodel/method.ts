// SPDX-License-Identifier: EPL-2.0
//
// Method acts (MetaABM's AMethod): code written in the model's language,
// TypeScript, run where a flow reaches the act. This is the API a method body
// sees, proposed under R21 in docs/metamodel-review.md.
import { CellOccupant, type Agent } from '@metascape/engine';
import type { Frame } from './flows';
import type { Datum } from './functions';
import { InterpScape, isHolder, type Holder, type RunState } from './runtime';

/** An agent or scape as a method body sees it: its attributes, by ID. */
export interface MethodAgent {
  /** The agent's number in the run. */
  readonly id: number;
  /** The value of one of the agent's attributes. */
  get(attribute: string): Datum;
  /** Sets one of the agent's attributes. Its watches run, as for a set act. */
  set(attribute: string, value: Datum): void;
  /** The grid cell the agent stands on, if it stands on one whose cells are agents of the model. */
  readonly cell: MethodAgent | undefined;
}

/** The scape an agent is in, as a method body sees it. */
export interface MethodScape extends MethodAgent {
  /** The current period. */
  readonly period: number;
}

/** The model's random stream, seeded, as a method body sees it. Use it for every random choice. */
export interface MethodRandom {
  /** A number from 0 (inclusive) to 1 (exclusive). */
  unit(): number;
  /** An integer from `min` to `max`, both inclusive. */
  int(min: number, max: number): number;
  /** True with probability `p` (default one half). */
  chance(p?: number): boolean;
  /** One of the items, chosen uniformly. */
  pick<T>(items: readonly T[]): T;
}

/** Runs a method body for the agent bound by the act's selection. */
export type MethodRunner = (agent: Agent, frame: Frame) => void;

/** Names a body cannot reach, so that it uses `random` and leaves the page alone. Not a security boundary. */
const HIDDEN = [
  'globalThis',
  'window',
  'document',
  'fetch',
  'XMLHttpRequest',
  'setTimeout',
  'setInterval',
  'crypto',
  'performance',
  'Date',
] as const;

/** `Math` without `Math.random`, whose draws would not follow the seed. */
const SEEDED_MATH: Readonly<Partial<Math>> = Object.freeze(
  Object.fromEntries(
    Object.getOwnPropertyNames(Math)
      .filter((name) => name !== 'random')
      .map((name) => [name, (Math as unknown as Record<string, unknown>)[name]]),
  ),
);

function view(holder: Holder & Agent, state: RunState): MethodAgent {
  const attribute = (id: string) => {
    const found = holder.info.attribute.get(id);
    if (!found) throw new Error(`${holder.info.label} has no attribute \`${id}\``);
    return found;
  };
  return {
    id: holder.id,
    get: (id) => state.read(holder, attribute(id)),
    set: (id, value) => state.write(holder, attribute(id), value),
    get cell() {
      const cell = holder instanceof CellOccupant ? holder.hostCell : undefined;
      return cell && isHolder(cell) ? view(cell as Holder & Agent, state) : undefined;
    },
  };
}

/**
 * Compiles a method body once. The body is the statements of a function of
 * `(agent, scape, random)`, written in TypeScript without type annotations
 * (that is, the JavaScript subset of TypeScript), so that it can run without
 * a compiler. `this` is undefined and a return value is ignored.
 */
export function createMethod(body: string, actId: string): MethodRunner {
  let compiled: (...args: unknown[]) => unknown;
  try {
    // Method bodies are model code, compiled once (R21).
    compiled = new Function(
      'agent',
      'scape',
      'random',
      'Math',
      ...HIDDEN,
      `'use strict';\n${body}`,
    ) as (...args: unknown[]) => unknown;
  } catch (error) {
    throw new Error(
      `The body of method \`${actId}\` does not compile: ${(error as Error).message}`,
      { cause: error },
    );
  }
  return (agent, frame) => {
    const state = frame.state;
    if (!isHolder(agent))
      throw new Error(`Method \`${actId}\` runs on an agent with no attributes`);
    // The scape the agent is in; the root scape is its own.
    const scapeHolder = agent instanceof InterpScape ? (agent.context ?? agent) : agent.context;
    if (!scapeHolder) throw new Error(`Method \`${actId}\` runs on an agent outside any scape`);
    const random = frame.random;
    const api: MethodRandom = {
      unit: () => random.float(),
      int: (min, max) => random.int(min, max + 1),
      chance: (p = 0.5) => random.chance(p),
      pick: (items) => random.pick(items),
    };
    const scapeView: MethodScape = {
      ...view(scapeHolder, state),
      get period() {
        return state.period;
      },
    };
    try {
      compiled.call(
        undefined,
        view(agent as Holder & Agent, state),
        scapeView,
        api,
        SEEDED_MATH,
        ...HIDDEN.map(() => undefined),
      );
    } catch (error) {
      throw new Error(`Method \`${actId}\` failed: ${(error as Error).message}`, { cause: error });
    }
  };
}
