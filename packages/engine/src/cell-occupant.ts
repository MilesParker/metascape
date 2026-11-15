// SPDX-License-Identifier: EPL-2.0
import { addOccupant, Cell, removeOccupant, type HostCell } from './cell';
import type { Scape } from './scape';
import type { FindOptions, Point, Space } from './space/space';

/**
 * An agent that is a member of one scape but stands on a {@link HostCell} of
 * another, its host scape: an ant on a lattice, a household at a map
 * location. Scapes are cell occupants too, so a whole scape can stand on a cell.
 *
 * What a cell occupant finds and where it can move is decided by the space of
 * the host scape, never by the occupant: `randomWalk()` is a step to one of
 * four cells on a von Neumann lattice and along one link on a graph.
 *
 * By default a host cell holds one occupant; moving onto a taken cell throws
 * unless the host space allows several. Death frees the cell: this is done in
 * {@link removed}, so subclasses that override `removed()` must call
 * `super.removed()`. Random choices an occupant makes about its own movement
 * use its own random stream.
 */
export class CellOccupant<H extends HostCell = HostCell> extends Cell {
  #hostCell: H | undefined;
  #hostScape: Scape<H> | undefined;

  /** The cell this agent stands on, or `undefined` if it is nowhere. */
  get hostCell(): H | undefined {
    return this.#hostCell;
  }

  /** The scape whose cells this agent stands on: the one it was given, or that of its host cell. */
  get hostScape(): Scape<H> | undefined {
    return this.#hostScape ?? (this.#hostCell?.scape as Scape<H> | undefined);
  }

  set hostScape(scape: Scape<H> | undefined) {
    this.#hostScape = scape;
  }

  /** The column of the host cell; the agent's own position while it stands nowhere. */
  override get x(): number {
    return this.#hostCell ? this.#hostCell.x : super.x;
  }

  /** The row of the host cell; the agent's own position while it stands nowhere. */
  override get y(): number {
    return this.#hostCell ? this.#hostCell.y : super.y;
  }

  /** Moves onto a host cell. A no-op if already there; throws if the cell is taken (single occupancy). */
  override moveTo(cell: H): void;
  /** Moves to a position in this agent's own scape, as any located agent can. */
  override moveTo(x: number, y: number): void;
  override moveTo(target: H | number, y?: number): void {
    if (typeof target === 'number') {
      super.moveTo(target, y as number);
      return;
    }
    if (target === this.#hostCell) return;
    if (!this.alive) throw new Error('A cell occupant must be a live member of a scape to move');
    if (!target.isAvailable && !target.scape.space.multiOccupancy) {
      throw new Error(`Cell (${target.x}, ${target.y}) is already occupied`);
    }
    this.leave();
    this.#hostCell = target;
    addOccupant(target, this as unknown as CellOccupant);
  }

  /** Steps off the current cell, if any. */
  leave(): void {
    const cell = this.#hostCell;
    if (!cell) return;
    removeOccupant(cell, this as unknown as CellOccupant);
    this.#hostCell = undefined;
  }

  /** Frees the cell on death. Subclasses overriding this must call `super.removed()`. */
  override removed(): void {
    this.leave();
  }

  /** The occupants standing on the cells next to this agent's, in neighbor order. */
  override get neighbors(): readonly this[] {
    return this.neighboringOccupants() as unknown as this[];
  }

  /** The occupants standing on the cells next to this agent's, in neighbor order. */
  neighboringOccupants(): CellOccupant[] {
    return this.#hostCell ? this.#hostCell.neighboringOccupants() : [];
  }

  /** The occupants standing within a distance of this agent's cell, as the host space measures it. */
  override findWithin(distance: number, options: FindOptions<this> = {}): this[] {
    const here = this.#hostCell;
    if (!here) return [];
    const found: this[] = [];
    const cells = (here.scape.space as unknown as Space<H>).findWithin(here, distance, {
      includeSelf: true,
    });
    for (const cell of cells) {
      for (const occupant of cell.occupants as unknown as readonly this[]) {
        if (occupant === this && !options.includeSelf) continue;
        if (options.condition && !options.condition(occupant)) continue;
        found.push(occupant);
      }
    }
    return found;
  }

  /**
   * Steps onto a uniformly chosen neighboring cell if it is free (or the host
   * space allows several occupants), as Ascape's `randomWalk`.
   */
  randomWalk(): void {
    const here = this.#hostCell;
    if (!here) throw new Error('A cell occupant with no location cannot walk');
    const neighbors = here.neighbors;
    if (neighbors.length === 0) return;
    const candidate = this.random.pick(neighbors);
    if (!candidate.isAvailable && !here.scape.space.multiOccupancy) return;
    this.moveTo(candidate);
  }

  /** Steps onto a uniformly chosen free neighboring cell. Returns false if there is none. */
  randomWalkAvailable(): boolean {
    const candidate = this.#hostCell?.findRandomAvailableNeighbor(this.random);
    if (!candidate) return false;
    this.moveTo(candidate);
    return true;
  }

  /**
   * Moves onto a uniformly chosen free cell of the host scape, drawn from the
   * host scape's random stream. If every cell is taken, the agent dies.
   */
  moveToRandomLocation(): void {
    const host = this.hostScape;
    if (!host) throw new Error('A cell occupant needs a host scape to be placed in');
    const cell = host.findRandom((candidate) => candidate.isAvailable);
    if (cell) this.moveTo(cell);
    else this.die();
  }

  /**
   * Steps onto the neighboring cell that brings it closest to a target, if
   * that cell is free. Returns the number of cells moved, 0 or 1.
   */
  override moveToward(target: Point): number {
    return this.#stepRelativeTo(target, true);
  }

  /** Steps onto the neighboring cell that takes it farthest from a target, if that cell is free. */
  override moveAway(target: Point): number {
    return this.#stepRelativeTo(target, false);
  }

  #stepRelativeTo(target: Point, toward: boolean): number {
    const here = this.#hostCell;
    if (!here) return 0;
    const cell = target instanceof CellOccupant ? target.hostCell : target;
    if (!cell) return 0;
    const space = here.scape.space as unknown as Space<H>;
    const next = toward ? space.toward(here, cell as H) : space.away(here, cell as H);
    if (!next || (!next.isAvailable && !space.multiOccupancy)) return 0;
    this.moveTo(next);
    return 1;
  }
}
