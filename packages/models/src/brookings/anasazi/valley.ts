// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.aa.LHV, Location, EnvironmentZone, MaizeZone,
// YieldZone (and its helper Locations), WaterSource, GeneralValleyStreamSource, HistoricSettlement,
// Settlement, Farm, Clan.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.

/**
 * The Long House Valley landscape: environment, maize and yield zones, the
 * 80 x 120 lattice of locations, water sources, historic settlements,
 * simulated settlements and farms, and the spatial searches the households
 * use. One {@link LongHouseValley} is created per simulation run.
 */
import {
  Cell,
  Occupant,
  rgb,
  type Color,
  type GridScape,
  type Random,
  type Scape,
  type Simulation,
} from '@metascape/engine';
import {
  cellFromMeters,
  EARLIEST_YEAR,
  isOnLattice,
  longHouseValleyData,
  VALLEY_HEIGHT,
  VALLEY_WIDTH,
  type HistoricSettlementRecord,
  type LongHouseValleyData,
} from './data/decode';
import { gaussian, javaInt } from './java-random';

/** java.awt.Color constants used by the legacy draw features. */
export const AWT = {
  white: rgb(255, 255, 255),
  black: rgb(0, 0, 0),
  red: rgb(255, 0, 0),
  green: rgb(0, 255, 0),
  blue: rgb(0, 0, 255),
  yellow: rgb(255, 255, 0),
  pink: rgb(255, 175, 175),
  orange: rgb(255, 200, 0),
  gray: rgb(128, 128, 128),
  lightGray: rgb(192, 192, 192),
  cyan: rgb(0, 255, 255),
} as const satisfies Record<string, Color>;

/** An environment zone of the valley, with the colour of the legacy "Environment Zone" fill. */
export interface EnvironmentZoneInfo {
  /** 0..5 index into the environmental histories; 6 for off the map. */
  readonly index: number;
  readonly name: string;
  readonly color: Color;
}

/** `LHV.ENVIRON_*`, in the order of the `environmentZones` scape. */
export const ENVIRONMENT_ZONES: readonly EnvironmentZoneInfo[] = [
  { index: 0, name: 'General Valley Floor', color: AWT.black },
  { index: 1, name: 'North Valley Floor', color: AWT.red },
  { index: 2, name: 'Mid-Valley Floor', color: AWT.green },
  { index: 3, name: 'Uplands Natural', color: AWT.yellow },
  { index: 4, name: 'Uplands Arable', color: AWT.blue },
  { index: 5, name: 'Kinbiko Canyon', color: AWT.pink },
  { index: 6, name: 'Empty', color: AWT.white },
];
/** Index of the off-map zone (`LHV.ENVIRON_EMPTY`). */
export const ZONE_EMPTY = 6;
const ZONE_GENERAL = 0;
const ZONE_NORTH = 1;
const ZONE_MID = 2;
const ZONE_UPLANDS_NATURAL = 3;
const ZONE_UPLANDS_ARABLE = 4;
const ZONE_KINBIKO = 5;

/** Maize productivity classes (`LHV.MAIZE_*`). */
export type MaizeKind = 'empty' | 'noYield' | 'yield1' | 'yield2' | 'yield3' | 'sandDune';

/** Maize yield of a class under a given adjusted PDSI (`YieldZone.calculateYield`). */
export function maizeYield(kind: MaizeKind, apdsi: number): number {
  const table: Record<MaizeKind, readonly number[] | undefined> = {
    empty: undefined,
    noYield: undefined,
    yield1: [1153, 988, 821, 719, 617],
    yield2: [961, 824, 684, 599, 514],
    yield3: [769, 659, 547, 479, 411],
    sandDune: [1201, 1030, 855, 749, 642],
  };
  const row = table[kind];
  if (!row) return 0;
  if (apdsi >= 3.0) return row[0]!;
  if (apdsi >= 1.0) return row[1]!;
  if (apdsi > -1.0) return row[2]!;
  if (apdsi > -3.0) return row[3]!;
  return row[4]!;
}

/** A yield zone definition: an environment zone paired with a maize class. */
export interface YieldZoneInfo {
  readonly name: string;
  readonly color: Color;
  readonly environmentZone: number;
  readonly maize: MaizeKind;
}

/** `LHV.YIELD_*`, in the order of the `yieldZones` scape, which is the search order for farmland. */
export const YIELD_ZONES: readonly YieldZoneInfo[] = [
  { name: 'Empty', color: AWT.white, environmentZone: ZONE_EMPTY, maize: 'empty' },
  {
    name: 'General Valley Floor',
    color: AWT.black,
    environmentZone: ZONE_GENERAL,
    maize: 'yield2',
  },
  { name: 'North Valley Dunes', color: AWT.white, environmentZone: ZONE_NORTH, maize: 'sandDune' },
  { name: 'North Valley Floor', color: AWT.red, environmentZone: ZONE_NORTH, maize: 'yield1' },
  { name: 'Mid Valley Dunes', color: AWT.white, environmentZone: ZONE_MID, maize: 'sandDune' },
  { name: 'West Mid-Valley Floor', color: AWT.gray, environmentZone: ZONE_MID, maize: 'yield1' },
  { name: 'East Mid-Valley Floor', color: AWT.green, environmentZone: ZONE_MID, maize: 'yield2' },
  {
    name: 'Uplands Natural',
    color: AWT.yellow,
    environmentZone: ZONE_UPLANDS_NATURAL,
    maize: 'noYield',
  },
  {
    name: 'Uplands Arable',
    color: AWT.blue,
    environmentZone: ZONE_UPLANDS_ARABLE,
    maize: 'yield3',
  },
  { name: 'Kinbiko Canyon', color: AWT.pink, environmentZone: ZONE_KINBIKO, maize: 'yield1' },
];

/** Index into {@link YIELD_ZONES} for a location (`Location.calculateYieldZone`). */
export function yieldZoneIndex(environmentZone: number, sandDune: boolean, x: number): number {
  switch (environmentZone) {
    case ZONE_NORTH:
      return sandDune ? 2 : 3;
    case ZONE_KINBIKO:
      return 9;
    case ZONE_MID:
      if (sandDune) return 4;
      return x <= 34 ? 5 : 6;
    case ZONE_GENERAL:
      return 1;
    case ZONE_UPLANDS_ARABLE:
      return 8;
    case ZONE_UPLANDS_NATURAL:
      return 7;
    case ZONE_EMPTY:
      return 0;
    default:
      throw new Error('Bad data or logic in Location#CalculateMaizeZone');
  }
}

/** Streams flow in the general valley (`LHV.isStreamsExist`). */
export function isStreamsExist(year: number): boolean {
  return (
    (year >= 280 && year < 360) || (year >= 800 && year < 930) || (year >= 1300 && year < 1450)
  );
}

/** Alluvial aquifers are high (`LHV.isAlluviumExists`). */
export function isAlluviumExists(year: number): boolean {
  return (
    (year >= 420 && year < 560) ||
    (year >= 630 && year < 680) ||
    (year >= 980 && year < 1120) ||
    (year >= 1180 && year < 1230)
  );
}

/** Whether a whole environment zone counts as a water source in a year (`LHV.isWaterSource`). */
export function isZoneWaterSource(zone: number, year: number): boolean {
  if (
    isAlluviumExists(year) &&
    (zone === ZONE_GENERAL || zone === ZONE_NORTH || zone === ZONE_MID || zone === ZONE_KINBIKO)
  ) {
    return true;
  }
  return isStreamsExist(year) && zone === ZONE_KINBIKO;
}

/** A clan (`Clan`); used by the disaggregated models only. */
export interface Clan {
  readonly index: number;
  readonly name: string;
  readonly color: Color;
}

/** `Clan.clans`: the six clans households are assigned to (black and white clans are unused). */
export const CLANS: readonly Clan[] = [
  { index: 0, name: 'Orange Clan', color: AWT.orange },
  { index: 1, name: 'Red Clan', color: AWT.red },
  { index: 2, name: 'Green Clan', color: AWT.green },
  { index: 3, name: 'Pink Clan', color: AWT.pink },
  { index: 4, name: 'Yellow Clan', color: AWT.yellow },
  { index: 5, name: 'Cyan Clan', color: AWT.cyan },
];

/** The per-run state of an environment zone (`EnvironmentZone`), set from the histories each year. */
export class EnvironmentZoneState {
  readonly info: EnvironmentZoneInfo;
  pdsi = 0;
  hydrology = 0;
  aggradation = 0;
  apdsi = 0;
  isWaterSource = false;
  constructor(info: EnvironmentZoneInfo) {
    this.info = info;
  }
}

/**
 * The locations of a yield zone still available for farming, kept in
 * ascending order of quality (`Locations`). The legacy list re-sorted lazily
 * with a stable sort; inserting each new entry after all entries of equal
 * quality gives the same order. `remove` removes the first occurrence, and
 * duplicates are possible, as in the legacy code.
 */
export class LocationList {
  readonly #items: Location[] = [];
  get length(): number {
    return this.#items.length;
  }
  add(location: Location): void {
    const items = this.#items;
    let low = 0;
    let high = items.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (items[mid]!.quality <= location.quality) low = mid + 1;
      else high = mid;
    }
    items.splice(low, 0, location);
  }
  remove(location: Location): boolean {
    const index = this.#items.indexOf(location);
    if (index < 0) return false;
    this.#items.splice(index, 1);
    return true;
  }
  /** The location of highest quality, if any. */
  last(): Location | undefined {
    return this.#items[this.#items.length - 1];
  }
  removeLast(): Location | undefined {
    return this.#items.pop();
  }
  includes(location: Location): boolean {
    return this.#items.includes(location);
  }
}

/** The per-run state of a yield zone (`YieldZone`). */
export class YieldZone {
  readonly info: YieldZoneInfo;
  readonly environment: EnvironmentZoneState;
  /** Current maize yield per location of average quality. */
  yield = 0;
  readonly available = new LocationList();
  constructor(info: YieldZoneInfo, environment: EnvironmentZoneState) {
    this.info = info;
    this.environment = environment;
  }
  calculateYield(): void {
    this.yield = maizeYield(this.info.maize, this.environment.apdsi);
  }
}

/** A water source (`WaterSource`, or `GeneralValleyStreamSource` when `stream` is true). */
export class WaterSource {
  readonly type: number;
  readonly startDate: number;
  readonly endDate: number;
  readonly stream: boolean;
  constructor(type: number, startDate: number, endDate: number, stream: boolean) {
    this.type = type;
    this.startDate = startDate;
    this.endDate = endDate;
    this.stream = stream;
  }
  /** Permanent sources always; reservoirs between their dates; streams in stream years. */
  isExtant(year: number): boolean {
    if (this.stream) return isStreamsExist(year);
    return this.type === 2 || (this.type === 3 && this.startDate <= year && this.endDate >= year);
  }
}

/** Stream water sources added along the general valley (`LHV.importMap`). */
export const STREAM_LOCATIONS: readonly (readonly [number, number])[] = [
  [72, 5],
  [70, 6],
  [69, 7],
  [68, 8],
  [67, 9],
  [66, 10],
  [65, 11],
  [65, 12],
];

/** An archaeologically recorded habitation site (`HistoricSettlement`). */
export class HistoricSettlement {
  readonly record: HistoricSettlementRecord;
  readonly x: number;
  readonly y: number;
  constructor(record: HistoricSettlementRecord, x: number, y: number) {
    this.record = record;
    this.x = x;
    this.y = y;
  }
  /** Occupied from its start date up to, not including, its end date. */
  isExtant(year: number): boolean {
    return this.record.startDate <= year && this.record.endDate > year;
  }
  /**
   * Households, interpolated linearly from one at the start date up to the
   * baseline at the median date and back down to one at the end date, with
   * Java's float arithmetic and int cast (`HistoricSettlement.getHouseholdCount`).
   */
  householdCount(year: number): number {
    const { startDate, endDate, medianDate, baselineHouseholds } = this.record;
    if (year > medianDate) {
      const ratio = Math.fround(
        Math.fround(baselineHouseholds * Math.fround(endDate - year)) /
          Math.fround(endDate - medianDate),
      );
      return javaInt(Math.max(Math.ceil(ratio), 1));
    }
    if (year < medianDate) {
      const ratio = Math.fround(
        Math.fround(baselineHouseholds * Math.fround(year - startDate)) /
          Math.fround(medianDate - startDate),
      );
      return javaInt(Math.max(Math.ceil(ratio), 1));
    }
    return baselineHouseholds;
  }
}

/** The minimal view of a household that the landscape needs. */
export interface FarmingHousehold {
  readonly clan: Clan | null;
}

/** A farm plot worked by a household (`Farm`). */
export class Farm {
  readonly household: FarmingHousehold;
  location: Location | null = null;
  constructor(household: FarmingHousehold) {
    this.household = household;
  }
  leave(): void {
    if (this.location) {
      this.location.setFarm(null);
      this.location = null;
    }
  }
  occupy(location: Location): void {
    if (this.location !== null) {
      throw new Error('Farm must leave previous location before occuping new one.');
    }
    location.setFarm(this);
    this.location = location;
  }
}

/**
 * A simulated settlement: the households living at one location
 * (`Settlement`). It stands on the lattice as an occupant so views can draw it.
 */
export class Settlement extends Occupant<Location> {
  readonly households: FarmingHousehold[] = [];
  location: Location | null = null;
  get size(): number {
    return this.households.length;
  }
  add(household: FarmingHousehold): void {
    this.households.push(household);
  }
  /** Removes a household; an emptied settlement is disbanded. */
  remove(household: FarmingHousehold): boolean {
    const index = this.households.indexOf(household);
    if (index < 0) return false;
    this.households.splice(index, 1);
    if (this.households.length === 0) this.disband();
    return true;
  }
  /** `Settlement.leave`: leaves the settlements scape and frees the location. */
  disband(): void {
    const location = this.location;
    if (location) {
      this.die();
      location.setSettlement(null);
      this.location = null;
    }
  }
  occupy(location: Location): void {
    location.setSettlement(this);
    this.location = location;
    this.moveTo(location);
  }
}

/** Marks a location with historic settlements on the lattice, so views can draw it. */
export class HistoricSite extends Occupant<Location> {
  readonly world: LongHouseValley;
  readonly x: number;
  readonly y: number;
  constructor(world: LongHouseValley, x: number, y: number) {
    super();
    this.world = world;
    this.x = x;
    this.y = y;
  }
  override initialize(): void {
    const location = this.world.grid.at(this.x, this.y);
    if (!location) throw new Error('Historic site off the lattice');
    this.moveTo(location);
  }
  get location(): Location {
    const location = this.cell;
    if (!location) throw new Error('Historic site not placed');
    return location;
  }
}

/** One cell of the valley (`Location`). */
export class Location extends Cell {
  readonly world: LongHouseValley;
  readonly environmentZone: EnvironmentZoneState;
  readonly yieldZone: YieldZone;
  readonly onMap: boolean;
  readonly sandDune: boolean;
  readonly waterSource: WaterSource | null;
  readonly historicSettlements: readonly HistoricSettlement[];
  /** Fixed for the run; drawn at initialization (`Location.initialize`). */
  quality = 1;
  clan: Clan | null = null;
  farm: Farm | null = null;
  settlement: Settlement | null = null;

  constructor(world: LongHouseValley, x: number, y: number) {
    super();
    this.world = world;
    const code = world.data.map[x * VALLEY_HEIGHT + y]!;
    const zone = Math.trunc(code / 10);
    if (zone < 0 || zone > 6) throw new Error('Bad data in map import.');
    this.environmentZone = world.environmentZones[zone]!;
    this.onMap = zone !== ZONE_EMPTY;
    this.sandDune = code % 10 >= 5;
    this.yieldZone = world.yieldZones[yieldZoneIndex(zone, this.sandDune, x)]!;
    this.waterSource = world.waterSourceAt.get(x * VALLEY_HEIGHT + y) ?? null;
    this.historicSettlements = world.historicSettlementsAt.get(x * VALLEY_HEIGHT + y) ?? [];
  }

  override initialize(): void {
    this.quality = Math.max(
      gaussian(this.random) * this.world.parameters.harvestVarianceLocation + 1.0,
      0.0,
    );
    this.yieldZone.available.add(this);
    this.settlement = null;
    this.farm = null;
    this.clan = null;
  }

  /** Neither farmed nor settled (`Location.isAvailable`; renamed to keep the engine's `Cell.isAvailable`). */
  get isFree(): boolean {
    return this.farm === null && this.settlement === null;
  }

  /** `Location.getBaseYield`: zone yield times location quality times harvest adjustment. */
  get baseYield(): number {
    return this.yieldZone.yield * this.quality * this.world.parameters.harvestAdjustment;
  }

  /** A harvest: the base yield with a normal deviation (`Location.findRandomYield`). */
  findRandomYield(): number {
    return (
      this.baseYield * (gaussian(this.random) * this.world.parameters.harvestVarianceLocation + 1.0)
    );
  }

  setFarm(farm: Farm | null): void {
    if (this.farm !== farm) {
      if (farm === null && this.settlement === null) {
        this.makeAvailable();
      } else if (this.farm === null) {
        this.makeUnavailable();
      }
      this.farm = farm;
      if (farm !== null && farm.household.clan !== null) this.clan = farm.household.clan;
    }
  }

  setSettlement(settlement: Settlement | null): void {
    if (this.settlement !== settlement) {
      if (settlement === null && this.farm === null) {
        this.makeAvailable();
      } else if (this.settlement === null) {
        this.makeUnavailable();
      }
      this.settlement = settlement;
      if (settlement !== null && settlement.households[0]) {
        this.clan = settlement.households[0].clan;
      }
    }
  }

  /** `Location.createSettlement`. */
  createSettlement(): void {
    const settlement = new Settlement();
    this.settlement = settlement;
    this.world.settlementScape.add(settlement);
    settlement.occupy(this);
    this.makeUnavailable();
  }

  makeAvailable(): void {
    this.yieldZone.available.add(this);
  }

  makeUnavailable(): void {
    this.yieldZone.available.remove(this);
  }

  /** Some historic settlement here is occupied this year. */
  get isCurrentHistoricSettlement(): boolean {
    const year = this.world.year;
    return this.historicSettlements.some((settlement) => settlement.isExtant(year));
  }

  /** Households over all historic settlements here, extant or not (`getHistoricSettlementHouseholdCount`). */
  get historicSettlementHouseholdCount(): number {
    const year = this.world.year;
    let count = 0;
    for (const settlement of this.historicSettlements) count += settlement.householdCount(year);
    return count;
  }

  /** The zone is a water source this year, or an extant water source lies here. */
  get isCurrentWaterSource(): boolean {
    return (
      this.environmentZone.isWaterSource ||
      (this.waterSource !== null && this.waterSource.isExtant(this.world.year))
    );
  }
}

/** The model parameters the landscape reads. */
export interface ValleyParameters {
  readonly startYear: number;
  readonly harvestAdjustment: number;
  readonly harvestVarianceLocation: number;
}

/** Per-tick event counts, cleared at the start of every step (the legacy uncollected stat collectors). */
export interface EventCounts {
  movements: number;
  fissions: number;
  departures: number;
  deathsStarvation: number;
  deathsOldAge: number;
  births: number;
  deaths: number;
  householdsFormed: number;
  householdsDisbanded: number;
}

/** One relative coordinate rank of Ascape's `Array2DBase.relativeCoordinatesTemplate`. */
interface Rank {
  readonly distance: number;
  readonly offsets: readonly (readonly [number, number])[];
}

/**
 * Ascape's search ranks for nearest-cell queries on a 2D lattice: every
 * offset with both components within 16, grouped by Euclidean distance and
 * ordered by it (135 ranks, 1089 offsets).
 */
const RANKS: readonly Rank[] = (() => {
  const groups = new Map<number, [number, number][]>();
  for (let dx = -16; dx <= 16; dx++) {
    for (let dy = -16; dy <= 16; dy++) {
      const d2 = dx * dx + dy * dy;
      const group = groups.get(d2) ?? [];
      group.push([dx, dy]);
      groups.set(d2, group);
    }
  }
  return [...groups.keys()]
    .sort((a, b) => a - b)
    .map((d2) => ({ distance: Math.sqrt(d2), offsets: groups.get(d2)! }));
})();

/** Number of search ranks; exported for tests. */
export const RANK_COUNT = RANKS.length;

/** `Array2D.MAX_RANK`: beyond this distance a failed rank search falls back to a full scan. */
const MAX_RANK = 135;

/** `DataPointConcrete.equals`: equality within a relative or absolute tolerance of 1e-10. */
function nearlyEqual(a: number, b: number): boolean {
  if (a === b) return true;
  return Math.abs((a - b) / (a + b)) < 1e-10 || Math.abs(a - b) < 1e-10;
}

/**
 * The world of one run: the landscape state shared by households, people
 * and views.
 */
export class LongHouseValley {
  readonly sim: Simulation;
  readonly parameters: ValleyParameters;
  readonly data: LongHouseValleyData;
  readonly environmentZones: readonly EnvironmentZoneState[];
  readonly yieldZones: readonly YieldZone[];
  readonly waterSources: readonly WaterSource[];
  readonly historicSettlements: readonly HistoricSettlement[];
  /** Water source per `x * 120 + y`; a later record at the same cell replaces an earlier one. */
  readonly waterSourceAt = new Map<number, WaterSource>();
  readonly historicSettlementsAt = new Map<number, HistoricSettlement[]>();
  readonly counts: EventCounts = {
    movements: 0,
    fissions: 0,
    departures: 0,
    deathsStarvation: 0,
    deathsOldAge: 0,
    births: 0,
    deaths: 0,
    householdsFormed: 0,
    householdsDisbanded: 0,
  };
  #grid: GridScape<Location> | undefined;
  readonly #waterRank = new Int16Array(VALLEY_WIDTH * VALLEY_HEIGHT).fill(-2);
  #waterRankDistance = Number.NaN;
  #settlements: Scape<Settlement> | undefined;

  constructor(sim: Simulation, parameters: ValleyParameters) {
    this.sim = sim;
    this.parameters = parameters;
    this.data = longHouseValleyData();
    this.environmentZones = ENVIRONMENT_ZONES.map((info) => new EnvironmentZoneState(info));
    this.yieldZones = YIELD_ZONES.map(
      (info) => new YieldZone(info, this.environmentZones[info.environmentZone]!),
    );
    const sources: WaterSource[] = [];
    for (const record of this.data.water) {
      const { x, y } = cellFromMeters(record.metersNorth, record.metersEast);
      if (!isOnLattice(x, y)) continue;
      const source = new WaterSource(record.type, record.startDate, record.endDate, false);
      this.waterSourceAt.set(x * VALLEY_HEIGHT + y, source);
      sources.push(source);
    }
    for (const [x, y] of STREAM_LOCATIONS) {
      const source = new WaterSource(0, 0, 0, true);
      this.waterSourceAt.set(x * VALLEY_HEIGHT + y, source);
      sources.push(source);
    }
    this.waterSources = sources;
    const historic: HistoricSettlement[] = [];
    for (const record of this.data.settlements) {
      if (record.type !== 1) continue;
      const { x, y } = cellFromMeters(record.metersNorth, record.metersEast);
      if (!isOnLattice(x, y)) continue;
      const settlement = new HistoricSettlement(record, x, y);
      const key = x * VALLEY_HEIGHT + y;
      const here = this.historicSettlementsAt.get(key) ?? [];
      here.push(settlement);
      this.historicSettlementsAt.set(key, here);
      historic.push(settlement);
    }
    this.historicSettlements = historic;
  }

  /** The current year: the start year plus the ticks executed. */
  get year(): number {
    return this.parameters.startYear + this.sim.tick;
  }

  get grid(): GridScape<Location> {
    if (!this.#grid) throw new Error('Valley grid not attached');
    return this.#grid;
  }
  set grid(grid: GridScape<Location>) {
    this.#grid = grid;
  }

  get settlementScape(): Scape<Settlement> {
    if (!this.#settlements) throw new Error('Settlements scape not attached');
    return this.#settlements;
  }
  set settlementScape(scape: Scape<Settlement>) {
    this.#settlements = scape;
  }

  /** Cells (x, y) with at least one historic settlement, in import order. */
  historicSiteCells(): (readonly [number, number])[] {
    return [...this.historicSettlementsAt.keys()].map(
      (key) => [Math.floor(key / VALLEY_HEIGHT), key % VALLEY_HEIGHT] as const,
    );
  }

  /** Sum of households over extant historic settlements ("Sum Historic Households"). */
  historicHouseholds(year = this.year): number {
    let total = 0;
    for (const settlement of this.historicSettlements) {
      if (settlement.isExtant(year)) total += settlement.householdCount(year);
    }
    return total;
  }

  /** Number of extant historic settlements ("Count Historic Households"). */
  extantHistoricSettlements(year = this.year): number {
    let total = 0;
    for (const settlement of this.historicSettlements) if (settlement.isExtant(year)) total++;
    return total;
  }

  /**
   * Sets each environment zone's values for the current year, then each
   * yield zone's yield (the legacy SetValues rules on the environment zones,
   * then the Calculate Yield rule on the yield zones).
   */
  updateEnvironment(): void {
    const year = this.year;
    const i = year - EARLIEST_YEAR;
    const history = this.data.environment;
    if (i < 0 || i >= history.apdsi[0]!.length) {
      throw new RangeError(`No environmental data for year ${year}`);
    }
    for (let zone = 0; zone < 6; zone++) {
      const state = this.environmentZones[zone]!;
      state.pdsi = history.pdsi[zone]![i]!;
      state.hydrology = history.hydrology[zone]![i]!;
      state.aggradation = history.aggradation[zone]![i]!;
      state.apdsi = history.apdsi[zone]![i]!;
      state.isWaterSource = isZoneWaterSource(zone, year);
    }
    for (const zone of this.yieldZones) zone.calculateYield();
    this.#waterRank.fill(-2);
  }

  /** Clears the per-tick event counts. */
  clearCounts(): void {
    for (const key of Object.keys(this.counts) as (keyof EventCounts)[]) this.counts[key] = 0;
  }

  /**
   * Takes the best available location for farming out of its zone's list:
   * the highest-quality location of each yield zone is compared by base
   * yield, the first zone winning ties; null if none yields anything
   * (`LHV.removeBestLocation`).
   */
  removeBestLocation(): Location | null {
    let best: Location | undefined;
    let bestZone: YieldZone | undefined;
    for (const zone of this.yieldZones) {
      const candidate = zone.available.last();
      if (candidate && (!best || candidate.baseYield > best.baseYield)) {
        best = candidate;
        bestZone = zone;
      }
    }
    if (best && bestZone && best.baseYield > 0) return bestZone.available.removeLast() ?? null;
    return null;
  }

  /**
   * The nearest rank (index into Ascape's rank table) holding a cell that
   * meets the condition, searching ranks of Euclidean distance strictly below
   * `maxDistance`; -1 if none (`Array2D.findNearestMatchRank`).
   */
  nearestMatchRank(
    origin: Location,
    condition: (location: Location) => boolean,
    includeOrigin: boolean,
    maxDistance: number,
  ): number {
    const grid = this.grid;
    for (let r = includeOrigin ? 0 : 1; r < RANKS.length && RANKS[r]!.distance < maxDistance; r++) {
      for (const [dx, dy] of RANKS[r]!.offsets) {
        const cell = grid.at(origin.x + dx, origin.y + dy);
        if (cell && condition(cell)) return r;
      }
    }
    return -1;
  }

  /** A uniformly random cell of a rank meeting the condition (`findRandomMatchInRank`). */
  randomMatchInRank(
    origin: Location,
    condition: (location: Location) => boolean,
    rank: number,
  ): Location | null {
    const grid = this.grid;
    const matches: Location[] = [];
    for (const [dx, dy] of RANKS[rank]!.offsets) {
      const cell = grid.at(origin.x + dx, origin.y + dy);
      if (cell && condition(cell)) matches.push(cell);
    }
    if (matches.length === 0) return null;
    return matches.length === 1 ? matches[0]! : grid.random.pick(matches);
  }

  /** Whether a location has water this year (`Location.HAS_WATER`). */
  readonly hasWater = (location: Location): boolean =>
    location.onMap && location.isCurrentWaterSource;

  /**
   * {@link findNearest} for {@link hasWater}. Water does not change within a
   * year, so the nearest water rank of each origin is cached until the
   * environment is next updated; the random choice within the rank is made
   * afresh on every call.
   */
  findNearestWater(origin: Location, maxDistance: number): Location | null {
    if (maxDistance !== this.#waterRankDistance) {
      this.#waterRank.fill(-2);
      this.#waterRankDistance = maxDistance;
    }
    const key = origin.x * VALLEY_HEIGHT + origin.y;
    let rank = this.#waterRank[key]!;
    if (rank === -2) {
      rank = this.nearestMatchRank(origin, this.hasWater, true, maxDistance);
      this.#waterRank[key] = rank;
    }
    if (rank >= 0) return this.randomMatchInRank(origin, this.hasWater, rank);
    return maxDistance > MAX_RANK
      ? this.findNearest(origin, this.hasWater, true, maxDistance)
      : null;
  }

  /**
   * Ascape's `Array2D.findNearest`: searches rank by rank of Euclidean
   * distance, strictly below `maxDistance`, and returns a random match from
   * the nearest rank holding one. If none is found and `maxDistance` exceeds
   * 135, falls back to the cell of least Moore distance on the whole lattice,
   * ties broken at random.
   */
  findNearest(
    origin: Location,
    condition: (location: Location) => boolean,
    includeOrigin: boolean,
    maxDistance: number,
  ): Location | null {
    const grid = this.grid;
    const rank = this.nearestMatchRank(origin, condition, includeOrigin, maxDistance);
    if (rank >= 0) return this.randomMatchInRank(origin, condition, rank);
    if (maxDistance <= MAX_RANK) return null;
    let bestDistance = Number.MAX_VALUE;
    let ties: Location[] = [];
    for (let x = 0; x < VALLEY_WIDTH; x++) {
      for (let y = 0; y < VALLEY_HEIGHT; y++) {
        const cell = grid.at(x, y)!;
        if (!includeOrigin && cell === origin) continue;
        const distance = Math.max(Math.abs(cell.x - origin.x), Math.abs(cell.y - origin.y));
        if (distance > maxDistance || !condition(cell)) continue;
        if (distance < bestDistance) {
          bestDistance = distance;
          ties = [cell];
        } else if (nearlyEqual(distance, bestDistance)) {
          ties.push(cell);
        }
      }
    }
    return ties.length === 0 ? null : ties.length === 1 ? ties[0]! : grid.random.pick(ties);
  }

  /**
   * Ascape's `Array2D.hasWithin`: whether any cell in the ranks of Euclidean
   * distance strictly below `maxDistance` meets the condition. With a
   * distance of 1.0, as the legacy settlement rules use, only the origin
   * itself (rank 0) is examined.
   */
  hasWithin(
    origin: Location,
    condition: (location: Location) => boolean,
    includeOrigin: boolean,
    maxDistance: number,
  ): boolean {
    return this.nearestMatchRank(origin, condition, includeOrigin, maxDistance) >= 0;
  }

  /**
   * Ascape's `findMaximumWithin` on a Moore lattice: the cell within Moore
   * distance `distance` (cast to int) of the origin with the greatest value,
   * ties (within 1e-10) broken at random.
   */
  findMaximumWithin(
    origin: Location,
    value: (location: Location) => number,
    includeSelf: boolean,
    distance: number,
  ): Location | null {
    const grid = this.grid;
    const reach = javaInt(distance);
    let maxValue = -Number.MAX_VALUE;
    let best: Location | null = null;
    let ties: Location[] | null = null;
    for (
      let x = Math.max(origin.x - reach, 0);
      x <= Math.min(origin.x + reach, VALLEY_WIDTH - 1);
      x++
    ) {
      for (
        let y = Math.max(origin.y - reach, 0);
        y <= Math.min(origin.y + reach, VALLEY_HEIGHT - 1);
        y++
      ) {
        const cell = grid.at(x, y)!;
        if (!includeSelf && cell === origin) continue;
        const v = value(cell);
        if (v > maxValue) {
          maxValue = v;
          best = cell;
          ties = null;
        } else if (nearlyEqual(v, maxValue)) {
          ties ??= best ? [best] : [];
          ties.push(cell);
        }
      }
    }
    if (ties) return grid.random.pick(ties);
    return best;
  }
}

/** Draws a uniform random clan (`Clan.randomClan`). */
export function randomClan(random: Random): Clan {
  return CLANS[random.int(0, CLANS.length)]!;
}
