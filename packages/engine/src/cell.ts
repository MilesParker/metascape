// SPDX-License-Identifier: EPL-2.0
import type { CellOccupant } from './cell-occupant';
import { LocatedAgent } from './located-agent';
import type { Random } from './random';
import type { Space } from './space/space';

/**
 * An agent with neighbors: one site of a scape's space. On a lattice a cell
 * is a square of it; in a list or a graph it is a place or a node. Cells are
 * agents, so they can carry state (such as the sugar on a patch) and rules
 * (such as growback or diffusion).
 */
export class Cell extends LocatedAgent {
  /** The neighboring members of this cell's scape, as its space defines them. Read-only. */
  get neighbors(): readonly this[] {
    return (this.scape.space as unknown as Space<this>).neighbors(this);
  }

  /** A uniformly chosen neighbor, optionally among those satisfying a condition. */
  findRandomNeighbor(condition?: (cell: this) => boolean): this | undefined {
    return (this.scape.space as unknown as Space<this>).findRandomNeighbor(this, condition);
  }

  /** True if an occupant could move here. A plain cell hosts nobody, so it is always free. */
  get isAvailable(): boolean {
    return true;
  }
}

/** Engine-internal: registers an occupant on a cell. Used by {@link CellOccupant} only. */
export let addOccupant: (cell: HostCell, occupant: CellOccupant) => void;

/** Engine-internal: unregisters an occupant from a cell. Used by {@link CellOccupant} only. */
export let removeOccupant: (cell: HostCell, occupant: CellOccupant) => void;

/**
 * A cell that other agents can stand on: a location for {@link CellOccupant}s.
 * It holds one occupant unless its scape's space allows several.
 */
export class HostCell extends Cell {
  readonly #occupants: CellOccupant[] = [];

  static {
    addOccupant = (cell, occupant) => {
      cell.#occupants.push(occupant);
    };
    removeOccupant = (cell, occupant) => {
      const index = cell.#occupants.indexOf(occupant);
      if (index >= 0) cell.#occupants.splice(index, 1);
    };
  }

  /** The occupants currently standing here. Read-only; do not hold on to it across moves. */
  get occupants(): readonly CellOccupant[] {
    return this.#occupants;
  }

  /** The first occupant to have arrived, if any. */
  get occupant(): CellOccupant | undefined {
    return this.#occupants[0];
  }

  /** True if nobody stands here. */
  override get isAvailable(): boolean {
    return this.#occupants.length === 0;
  }

  /** The neighboring cells nobody stands on, in neighbor order. */
  findAvailableNeighbors(): this[] {
    return this.neighbors.filter((neighbor) => neighbor.isAvailable);
  }

  /**
   * A uniformly chosen neighbor nobody stands on, or `undefined` if there is
   * none. Draws once from `random`: by default this cell's stream, but an
   * occupant choosing where to go passes its own.
   */
  findRandomAvailableNeighbor(random: Random = this.random): this | undefined {
    const neighbors = this.neighbors;
    let count = 0;
    for (let i = 0; i < neighbors.length; i++) if (neighbors[i]!.isAvailable) count++;
    if (count === 0) return undefined;
    // One draw, as `random.pick` would make, but without building an array.
    let remaining = random.int(0, count);
    for (let i = 0; i < neighbors.length; i++) {
      const neighbor = neighbors[i]!;
      if (neighbor.isAvailable && remaining-- === 0) return neighbor;
    }
    return undefined;
  }

  /** The occupants standing on the neighboring cells, in neighbor order. */
  neighboringOccupants(): CellOccupant[] {
    const found: CellOccupant[] = [];
    for (const neighbor of this.neighbors) found.push(...neighbor.occupants);
    return found;
  }
}
