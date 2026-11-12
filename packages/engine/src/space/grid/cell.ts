// SPDX-License-Identifier: EPL-2.0
import { Agent } from '../../agent';
import type { GridScape } from './grid-scape';
import type { Occupant } from './occupant';

/** Engine-internal: sets a cell's coordinates. Used by the grid only. */
export let placeCell: (cell: Cell, x: number, y: number) => void;

/** Engine-internal: registers an occupant on a cell. Used by {@link Occupant} only. */
export let addOccupant: (cell: Cell, occupant: Occupant) => void;

/** Engine-internal: unregisters an occupant from a cell. Used by {@link Occupant} only. */
export let removeOccupant: (cell: Cell, occupant: Occupant) => void;

/**
 * One site of a {@link GridScape}. Cells are agents, so they can carry state
 * (such as the sugar on a patch) and rules (such as growback or diffusion).
 *
 * The coordinates are assigned by the grid when it is populated.
 */
export class Cell extends Agent {
  #x = -1;
  #y = -1;
  readonly #occupants: Occupant[] = [];

  static {
    placeCell = (cell, x, y) => {
      cell.#x = x;
      cell.#y = y;
    };
    addOccupant = (cell, occupant) => {
      cell.#occupants.push(occupant);
    };
    removeOccupant = (cell, occupant) => {
      const index = cell.#occupants.indexOf(occupant);
      if (index >= 0) cell.#occupants.splice(index, 1);
    };
  }

  /** Column, from 0 at the left. */
  get x(): number {
    return this.#x;
  }

  /** Row, from 0 at the top. */
  get y(): number {
    return this.#y;
  }

  /** The grid this cell belongs to. */
  get grid(): GridScape<Cell> {
    return this.scape as GridScape<Cell>;
  }

  /** The occupants currently standing here. Read-only; do not hold on to it across moves. */
  get occupants(): readonly Occupant[] {
    return this.#occupants;
  }

  /** The first occupant to have arrived, if any. */
  get occupant(): Occupant | undefined {
    return this.#occupants[0];
  }

  /** True if nobody stands here. */
  get isAvailable(): boolean {
    return this.#occupants.length === 0;
  }

  /** The neighboring cells, as defined by the grid's neighborhood. See {@link GridScape.neighbors}. */
  get neighbors(): readonly this[] {
    return this.grid.neighbors(this) as unknown as readonly this[];
  }
}
