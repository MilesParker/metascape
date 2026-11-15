// SPDX-License-Identifier: EPL-2.0
import {
  Agent,
  CellOccupant,
  HostCell,
  ListSpace,
  LocatedAgent,
  type Array2D,
  type Continuous2D,
  type Graph,
  type Random,
  type RootScape,
  type Scape,
} from '@metascape/engine';
import type { Type } from './types';

/*
 * What compiled models run on: one agent class per role, each storing its
 * attributes in a Float64Array (booleans as 0 or 1, states as the index of
 * the state), the context of one run that compiled closures reach the
 * scapes through, and the frames that hold an action list's local variables.
 */

/** A compiled agent type, shared by every run of a compiled model. */
export interface AgentKind {
  readonly index: number;
  readonly name: string;
  readonly attributes: readonly { readonly name: string; readonly type: Type }[];
  /** True if the type has synchronous rules, so agents need a buffer of pending changes. */
  readonly synchronous: boolean;
  /** Gives a new agent its initial attribute values, then any pending `create` overrides. */
  init(agent: SpecAgent): void;
}

/** The state every compiled agent carries. */
interface SpecState {
  readonly kind: AgentKind;
  readonly context: ModelContext;
  /** Attribute values, by declaration order. */
  readonly v: Float64Array;
  /** Values set by synchronous rules, applied after every agent has acted. */
  readonly next: Float64Array | undefined;
  readonly dirty: Uint8Array | undefined;
  changed: boolean;
}

function buffers(kind: AgentKind): [Float64Array | undefined, Uint8Array | undefined] {
  const n = kind.attributes.length;
  return kind.synchronous ? [new Float64Array(n), new Uint8Array(n)] : [undefined, undefined];
}

/** A cell of a grid in a compiled model. */
export class SpecCell extends HostCell implements SpecState {
  readonly v: Float64Array;
  readonly next: Float64Array | undefined;
  readonly dirty: Uint8Array | undefined;
  changed = false;

  constructor(
    readonly kind: AgentKind,
    readonly context: ModelContext,
  ) {
    super();
    this.v = new Float64Array(kind.attributes.length);
    [this.next, this.dirty] = buffers(kind);
  }

  override initialize(): void {
    this.kind.init(this);
  }
}

/** An occupant of a grid in a compiled model. */
export class SpecOccupant extends CellOccupant<SpecCell> implements SpecState {
  readonly v: Float64Array;
  readonly next: Float64Array | undefined;
  readonly dirty: Uint8Array | undefined;
  changed = false;

  constructor(
    readonly kind: AgentKind,
    readonly context: ModelContext,
  ) {
    super();
    this.v = new Float64Array(kind.attributes.length);
    [this.next, this.dirty] = buffers(kind);
  }

  override initialize(): void {
    this.kind.init(this);
  }
}

/** An agent of a continuous space in a compiled model. */
export class SpecPoint extends LocatedAgent implements SpecState {
  readonly v: Float64Array;
  readonly next: Float64Array | undefined;
  readonly dirty: Uint8Array | undefined;
  changed = false;

  constructor(
    readonly kind: AgentKind,
    readonly context: ModelContext,
    x?: number,
    y?: number,
  ) {
    super(x, y);
    this.v = new Float64Array(kind.attributes.length);
    [this.next, this.dirty] = buffers(kind);
  }

  override initialize(): void {
    this.kind.init(this);
  }
}

/** An agent without a position in a compiled model. */
export class SpecPlain extends Agent implements SpecState {
  readonly v: Float64Array;
  readonly next: Float64Array | undefined;
  readonly dirty: Uint8Array | undefined;
  changed = false;

  constructor(
    readonly kind: AgentKind,
    readonly context: ModelContext,
  ) {
    super();
    this.v = new Float64Array(kind.attributes.length);
    [this.next, this.dirty] = buffers(kind);
  }

  override initialize(): void {
    this.kind.init(this);
  }
}

export type SpecAgent = SpecCell | SpecOccupant | SpecPoint | SpecPlain;

export function isSpecAgent(agent: Agent): agent is SpecAgent {
  return (
    agent instanceof SpecCell ||
    agent instanceof SpecOccupant ||
    agent instanceof SpecPoint ||
    agent instanceof SpecPlain
  );
}

/** Applies the changes a synchronous rule recorded for an agent. */
export function applyPending(agent: SpecAgent): void {
  if (!agent.changed) return;
  const { v, next, dirty } = agent;
  if (next && dirty) {
    for (let i = 0; i < dirty.length; i++) {
      if (dirty[i] !== 0) {
        v[i] = next[i]!;
        dirty[i] = 0;
      }
    }
  }
  agent.changed = false;
}

/**
 * One value of an agent's attribute: a number, a boolean, or the name of a
 * state. Works for agents of any model made by `compileModel`.
 */
export function readAttribute(agent: Agent, name: string): number | boolean | string {
  if (!isSpecAgent(agent)) throw new Error('readAttribute: not an agent of a compiled model');
  const index = agent.kind.attributes.findIndex((attribute) => attribute.name === name);
  const attribute = agent.kind.attributes[index];
  if (!attribute) {
    throw new Error(`readAttribute: agent type "${agent.kind.name}" has no attribute "${name}"`);
  }
  const value = agent.v[index]!;
  if (attribute.type.kind === 'boolean') return value !== 0;
  if (attribute.type.kind === 'state') return attribute.type.states[value] ?? '';
  return value;
}

/** What compiled closures reach the structure of one run through: its root, scapes and spaces. */
export class ModelContext {
  /** By agent type index. */
  readonly scapes: Scape<Agent>[] = [];
  /** By space index: the lattice of a grid. */
  readonly grids: (Array2D<SpecCell> | undefined)[] = [];
  /** By space index: the space of one of the scapes in that continuous space, for distances. */
  readonly continuous: (Continuous2D<SpecPoint> | undefined)[] = [];
  /** By space index: the graph of a network. */
  readonly networks: (Graph<Agent> | undefined)[] = [];
  /** Parameter values by index; booleans as 0 or 1. */
  readonly params: Float64Array;
  readonly widths: Float64Array;
  readonly heights: Float64Array;

  /** Where the next occupant added is placed (set by `create`). */
  pendingCell: SpecCell | undefined;
  /** Attribute overrides for the agent `create` is adding. */
  overrideKind: AgentKind | undefined;
  overrideSlots: readonly number[] = [];
  overrideValues: Float64Array = new Float64Array(0);

  constructor(
    readonly root: RootScape,
    parameterCount: number,
    spaceCount: number,
  ) {
    this.params = new Float64Array(parameterCount);
    this.widths = new Float64Array(spaceCount);
    this.heights = new Float64Array(spaceCount);
  }
}

/**
 * A free cell chosen uniformly with `random` (any cell on a multi-occupancy
 * grid), or `undefined` if every cell is taken.
 */
export function randomFreeCell(grid: Array2D<SpecCell>, random: Random): SpecCell | undefined {
  const cells = grid.members;
  const n = cells.length;
  if (n === 0) return undefined;
  if (grid.multiOccupancy) return cells[random.int(0, n)];
  // Mostly-empty grids: a few blind draws usually succeed.
  for (let attempt = 0; attempt < 16; attempt++) {
    const cell = cells[random.int(0, n)]!;
    if (cell.isAvailable) return cell;
  }
  let free = 0;
  for (let i = 0; i < n; i++) if (cells[i]!.isAvailable) free++;
  if (free === 0) return undefined;
  let remaining = random.int(0, free);
  for (let i = 0; i < n; i++) {
    const cell = cells[i]!;
    if (cell.isAvailable && remaining-- === 0) return cell;
  }
  return undefined;
}

/**
 * The space of an occupant type's scape: a list, like any collection, that
 * stands each new member on a cell of its grid, and has the grid's cells
 * created first, since a type may be declared before its grid.
 */
export class OccupantSpace extends ListSpace<SpecOccupant> {
  constructor(
    readonly context: ModelContext,
    readonly gridIndex: number,
  ) {
    super();
  }

  get grid(): Array2D<SpecCell> {
    const grid = this.context.grids[this.gridIndex];
    if (!grid) throw new Error(`Scape "${this.scape.name}": its grid does not exist`);
    return grid;
  }

  override populate(): void {
    this.grid.scape.populate();
    super.populate();
  }

  override added(agent: SpecOccupant): void {
    const context = this.context;
    let cell = context.pendingCell;
    context.pendingCell = undefined;
    cell ??= randomFreeCell(this.grid, this.random);
    if (!cell) {
      const grid = this.grid;
      throw new Error(
        `Not enough free cells for "${this.scape.name}": grid "${grid.scape.name}" has ${grid.width * grid.height} cells and allows one occupant per cell`,
      );
    }
    agent.moveTo(cell);
  }
}

/** Holds the local variables and bindings of one running action list or expression. */
export class Frame {
  self: SpecAgent | undefined = undefined;
  random!: Random;
  context!: ModelContext;
  readonly nums: Float64Array;
  readonly refs: (SpecAgent | undefined)[];

  constructor(nums: number, refs: number) {
    this.nums = new Float64Array(nums);
    this.refs = Array.from({ length: refs }, () => undefined);
  }
}

/**
 * Frames for one compiled context, reused across executions. A context can
 * be re-entered (an agent's initialize actions creating another agent of the
 * same type), so frames are kept per nesting depth.
 */
export class FramePool {
  readonly #frames: Frame[] = [];
  #depth = 0;

  constructor(readonly layout: { readonly nums: number; readonly refs: number }) {}

  enter(self: SpecAgent | undefined, context: ModelContext, random: Random): Frame {
    let frame = this.#frames[this.#depth];
    if (!frame) {
      frame = new Frame(this.layout.nums, this.layout.refs);
      this.#frames.push(frame);
    }
    this.#depth++;
    frame.self = self;
    frame.context = context;
    frame.random = random;
    return frame;
  }

  exit(): void {
    this.#depth--;
  }
}
