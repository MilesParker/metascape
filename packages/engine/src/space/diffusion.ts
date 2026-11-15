// SPDX-License-Identifier: EPL-2.0
import type { Cell } from '../cell';
import type { Rule } from '../rule';

export interface DiffusionOptions<C extends Cell> {
  /** Default `diffusion`. */
  readonly name?: string;
  /** Reads the quantity held by a cell. */
  readonly get: (cell: C) => number;
  /** Stores the new quantity. */
  readonly set: (cell: C, value: number) => void;
  /** Fraction (0..1) of its quantity each cell shares out equally among its neighbors per iteration. */
  readonly rate: number;
  /** Fraction (0..1) of each cell's quantity lost per iteration after diffusing. Default 0. */
  readonly evaporation?: number;
}

/**
 * A two-phase rule that diffuses a quantity over the cells of a scape, whatever its space. In `execute` each
 * cell computes its new value from the old values of itself and its
 * neighbors; `update` applies it, so the result does not depend on visiting
 * order. Without evaporation the total is conserved (up to floating-point
 * rounding), including on bounded lattices and cells with differing neighbor counts. It
 * needs no random order and removes nothing.
 */
export function diffusion<C extends Cell>(options: DiffusionOptions<C>): Rule<C> {
  const { get, set, rate } = options;
  const evaporation = options.evaporation ?? 0;
  for (const [label, value] of [
    ['rate', rate],
    ['evaporation', evaporation],
  ] as const) {
    if (!(value >= 0 && value <= 1)) throw new RangeError(`diffusion: ${label} must be in 0..1`);
  }
  const pending = new Map<C, number>();

  return {
    name: options.name ?? 'diffusion',
    randomExecution: false,
    causesRemoval: false,
    execute(cell) {
      const own = cell.neighbors as readonly C[];
      let value = own.length === 0 ? get(cell) : get(cell) * (1 - rate);
      for (const neighbor of own) {
        value += (get(neighbor) * rate) / (neighbor.neighbors as readonly C[]).length;
      }
      pending.set(cell, value * (1 - evaporation));
    },
    update(cell) {
      const value = pending.get(cell);
      if (value === undefined) return;
      pending.delete(cell);
      set(cell, value);
    },
  };
}
