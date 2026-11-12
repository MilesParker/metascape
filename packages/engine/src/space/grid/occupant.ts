// SPDX-License-Identifier: EPL-2.0
import { Agent } from '../../agent';
import { addOccupant, removeOccupant, type Cell } from './cell';

/**
 * An agent that lives in an ordinary scape but stands on a cell of a
 * {@link GridScape}, such as an ant or a trader.
 *
 * By default a cell holds one occupant; moving onto a taken cell throws unless
 * the grid has `multiOccupancy`. Death frees the cell: this is done in
 * {@link removed}, so subclasses that override `removed()` must call
 * `super.removed()`.
 */
export class Occupant<C extends Cell = Cell> extends Agent {
  #cell: C | undefined;

  /** The cell this agent stands on, or `undefined` if it is nowhere. */
  get cell(): C | undefined {
    return this.#cell;
  }

  /** Moves onto a cell. A no-op if already there; throws if the cell is taken (single occupancy). */
  moveTo(cell: C): void {
    if (cell === this.#cell) return;
    if (!this.alive) throw new Error('Occupant must be a live member of a scape to move');
    if (!cell.grid.multiOccupancy && !cell.isAvailable) {
      throw new Error(`Cell (${cell.x}, ${cell.y}) is already occupied`);
    }
    this.leave();
    this.#cell = cell;
    addOccupant(cell, this);
  }

  /** Steps off the current cell, if any. */
  leave(): void {
    const cell = this.#cell;
    if (!cell) return;
    removeOccupant(cell, this);
    this.#cell = undefined;
  }

  /** Frees the cell on death. Subclasses overriding this must call `super.removed()`. */
  override removed(): void {
    this.leave();
  }

  /** The occupants standing on the neighboring cells, in neighbor order. */
  neighboringOccupants(): Occupant[] {
    const cell = this.#cell;
    if (!cell) return [];
    const found: Occupant[] = [];
    for (const neighbor of cell.neighbors) found.push(...neighbor.occupants);
    return found;
  }

  /** Moves to a random unoccupied neighbor, using this agent's random stream. False if none. */
  moveToRandomAvailableNeighbor(): boolean {
    const cell = this.#cell;
    if (!cell) return false;
    const options = cell.neighbors.filter((neighbor) => neighbor.isAvailable);
    if (options.length === 0) return false;
    this.moveTo(this.random.pick(options) as C);
    return true;
  }
}
