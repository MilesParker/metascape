// SPDX-License-Identifier: EPL-2.0
//
// What generated code calls (`H` in the generated source): the interpreter's
// own functions for selections, spaces and commands, so that both mean the
// same, and small functions for values.
import { HostCell, LocatedAgent, type Agent, type Random } from '@metascape/engine';
import {
  die,
  exitCandidates,
  holderFor,
  populationOf,
  isAt,
  isAvailable,
  isHere,
  isInLine,
  isNeighbor,
  isWithin,
  leave,
  link,
  locate,
  move,
  nearestCells,
  searchesGrid,
  searchesRanks,
  spaceAround,
} from '../flows';
import type { Argument, Datum, SpatialTerm } from '../functions';
import type { AgentInfo, AttributeInfo, OwnerInfo, SpaceInfo } from '../model-index';
import { instancesOf, isHolder, type Holder, type RunState } from '../runtime';

/** Marks a value not yet remembered on a path. */
const UNSET: unique symbol = Symbol('unset');

/** As `num` in the interpreter. */
function num(value: Argument | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  throw new TypeError(`Expected a number, found ${JSON.stringify(value)}`);
}

function bool(value: Argument | undefined): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  throw new TypeError(`Expected a boolean, found ${JSON.stringify(value)}`);
}

function describe(agent: Agent): string {
  if (isHolder(agent)) return `${agent.info.label} ${agent.id}`;
  return agent instanceof HostCell ? `the cell at (${agent.x}, ${agent.y})` : `agent ${agent.id}`;
}

/** The agent itself, as the holder of its own type's attributes. */
function self(bound: Agent, owner: AgentInfo): Holder {
  if ((bound as Partial<Holder>).info === owner) return bound as unknown as Holder;
  throw new Error(`${describe(bound)} has no \`${owner.id}\` attributes`);
}

/** Reads an attribute that is not derived. */
function read(state: RunState, holder: Holder, attribute: AttributeInfo, index: number): Datum {
  return state.tracking ? state.read(holder, attribute) : holder.values[index]!;
}

/** Reads an attribute of the agent's own type that is not derived. */
function readOwn(
  state: RunState,
  bound: Agent,
  owner: AgentInfo,
  attribute: AttributeInfo,
  index: number,
): Datum {
  if ((bound as Partial<Holder>).info !== owner) self(bound, owner);
  const holder = bound as unknown as Holder;
  return state.tracking ? state.read(holder, attribute) : holder.values[index]!;
}

/** `original`: the value an attribute had when its agent started. */
function original(state: RunState, holder: Holder, attribute: AttributeInfo): Datum {
  return holder.originals?.[attribute.index] ?? state.read(holder, attribute);
}

/**
 * A spatial function used for its value outside a selection, as the
 * interpreter's `#spatialValue`: `bound` is the agent the selection named by
 * the query binds, `origin` the agent that selection searched from.
 */
function spatialValue(
  term: SpatialTerm,
  state: RunState,
  bound: Agent,
  origin: Agent | undefined,
  spaceInfo: SpaceInfo | undefined,
  a: Argument | undefined,
  b: Argument | undefined,
): Datum {
  const space = spaceInfo ? spaceAround(origin ?? bound, spaceInfo, state) : undefined;
  const from = origin && locate(space, origin);
  switch (term) {
    case 'distance':
      return origin && space ? (space.distance(origin, bound) ?? 0) : 0;
    case 'neighbor':
      return isNeighbor(space, origin, from, false, bound);
    case 'here':
      return isHere(space, origin, from, bound);
    case 'available':
      return isAvailable(bound);
    case 'within':
      return isWithin(space, origin, bound, num(a));
    case 'lineOfSight':
      return isInLine(space, origin, from, false, bound, num(a));
    case 'locationX':
    case 'locationY': {
      const at = locate(space, bound);
      return at instanceof LocatedAgent ? (term === 'locationX' ? at.x : at.y) : 0;
    }
    case 'location2D':
      return isAt(space, bound, num(a), num(b));
    default:
      return true;
  }
}

function unbound(select: string): never {
  throw new Error(`Internal error: \`${select}\` is not bound on this path`);
}

/** The helpers, frozen, as generated code sees them. */
export const HELPERS = Object.freeze({
  U: UNSET,
  num,
  bool,
  self,
  read,
  readOwn,
  original,
  holderFor: (bound: Agent, owner: OwnerInfo, state: RunState) => holderFor(bound, owner, state),
  spaceAround,
  locate,
  isHolder,
  instancesOf,
  isNeighbor,
  isWithin,
  isInLine,
  isHere,
  isAvailable,
  isAt,
  searchesGrid,
  searchesRanks,
  nearestCells,
  exitCandidates,
  populationOf,
  spatialValue,
  move,
  leave,
  die,
  link,
  unbound,
  integerDivision: (a: number, b: number) => {
    if (b === 0) throw new RangeError('Integer division by zero');
    return Math.trunc(a / b);
  },
  integerRemainder: (a: number, b: number) => {
    if (b === 0) throw new RangeError('Integer remainder by zero');
    return a % b;
  },
  randomInRangeInteger: (random: Random, low: number, high: number) =>
    high < low ? low : random.int(low, high + 1),
  randomInRangeReal: (random: Random, low: number, high: number) =>
    low + random.float() * (high - low),
  randomToLimitInteger: (random: Random, limit: number) => {
    if (limit <= 0) throw new RangeError(`randomToLimit needs a positive limit, got ${limit}`);
    return random.int(0, limit);
  },
  randomToLimitReal: (random: Random, limit: number) => random.float() * limit,
});
