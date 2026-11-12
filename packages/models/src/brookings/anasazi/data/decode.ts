// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.aa.LHV (importMap, importEnvironmentalHistory,
// importSettlementHistory), Location (streamToState, getCoordinateFromMeters), WaterSource
// (streamToState), HistoricSettlement (streamToState).
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.

/**
 * Typed decoders for the Long House Valley data files distributed with
 * Ascape 5.6.1. Each file is embedded byte for byte (as base64) in
 * `long-house-valley-data.ts`; this module reads it exactly as the Java code
 * read it with `java.io.DataInputStream`: big-endian signed 16-bit shorts and
 * big-endian 32-bit IEEE floats, in the record order documented below.
 */
import {
  ADJUSTED_PDSI_BIN,
  ENVIRONMENT_BIN,
  MAP_BIN,
  SETTLEMENTS_BIN,
  WATER_BIN,
} from './long-house-valley-data';

/** Width of the valley lattice in cells (x runs 0..79, west to east). */
export const VALLEY_WIDTH = 80;
/** Height of the valley lattice in cells (y runs 0..119, north to south). */
export const VALLEY_HEIGHT = 120;
/** First year covered by the environmental histories (`LHV.EARLIEST_YEAR`). */
export const EARLIEST_YEAR = 200;
/** Last year covered by the environmental histories (`LHV.LATEST_YEAR`). */
export const LATEST_YEAR = 1499;
/** First year for which `environment.bin` holds a PDSI value (`LHV.PDSI_EARLIEST_YEAR`). */
export const PDSI_EARLIEST_YEAR = 382;
/** Number of years in each history: 1300. */
export const YEARS = LATEST_YEAR - EARLIEST_YEAR + 1;
/** Number of records in `water.bin`, as read by `LHV.importMap`. */
export const WATER_RECORDS = 108;
/** Number of records in `settlements.bin`, as read by `LHV.importSettlementHistory`. */
export const SETTLEMENT_RECORDS = 488;
/** Environment zones with histories: general, north, mid, uplands natural, uplands arable, Kinbiko. */
export const HISTORY_ZONES = 6;

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_INDEX = new Map([...BASE64].map((char, index) => [char, index]));

/** Decodes standard base64 (with optional `=` padding) without relying on `atob` or `Buffer`. */
export function decodeBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let out = 0;
  for (const char of clean) {
    const value = BASE64_INDEX.get(char);
    if (value === undefined) throw new Error(`Invalid base64 character "${char}"`);
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out++] = (buffer >> bits) & 0xff;
    }
  }
  return bytes;
}

/** A big-endian reader over a byte array, mirroring `java.io.DataInputStream`. */
class DataReader {
  readonly #view: DataView;
  #offset = 0;
  constructor(bytes: Uint8Array) {
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  get remaining(): number {
    return this.#view.byteLength - this.#offset;
  }
  readShort(): number {
    const value = this.#view.getInt16(this.#offset, false);
    this.#offset += 2;
    return value;
  }
  readFloat(): number {
    const value = this.#view.getFloat32(this.#offset, false);
    this.#offset += 4;
    return value;
  }
}

function reader(base64: string): DataReader {
  return new DataReader(decodeBase64(base64));
}

/**
 * `map.bin`: 80 x 120 shorts, x outer and y inner (`LHV.importMap`). Each
 * value is `10 * zone + dune`: `zone` 0 general valley floor, 1 north valley
 * floor, 2 mid-valley floor, 3 uplands natural, 4 uplands arable, 5 Kinbiko
 * Canyon, 6 off the map; `dune` >= 5 marks sand dunes (`Location.streamToState`).
 * Returned indexed by `x * VALLEY_HEIGHT + y`.
 */
export function decodeMap(): Int16Array {
  const data = reader(MAP_BIN);
  const codes = new Int16Array(VALLEY_WIDTH * VALLEY_HEIGHT);
  for (let x = 0; x < VALLEY_WIDTH; x++) {
    for (let y = 0; y < VALLEY_HEIGHT; y++) codes[x * VALLEY_HEIGHT + y] = data.readShort();
  }
  if (data.remaining !== 0) throw new Error('map.bin: unexpected trailing bytes');
  return codes;
}

/** One record of `water.bin`: six shorts (`WaterSource.streamToState`). */
export interface WaterSourceRecord {
  readonly number: number;
  readonly metersNorth: number;
  readonly metersEast: number;
  /** 2 permanent, 3 reservoir (extant between the dates); other types are never extant. */
  readonly type: number;
  readonly startDate: number;
  readonly endDate: number;
}

/** `water.bin`: 108 records of six shorts each. */
export function decodeWaterSources(): WaterSourceRecord[] {
  const data = reader(WATER_BIN);
  const records: WaterSourceRecord[] = [];
  for (let i = 0; i < WATER_RECORDS; i++) {
    records.push({
      number: data.readShort(),
      metersNorth: data.readShort(),
      metersEast: data.readShort(),
      type: data.readShort(),
      startDate: data.readShort(),
      endDate: data.readShort(),
    });
  }
  if (data.remaining !== 0) throw new Error('water.bin: unexpected trailing bytes');
  return records;
}

/** One record of `settlements.bin`: twelve shorts (`HistoricSettlement.streamToState`). */
export interface HistoricSettlementRecord {
  /** Site number in the Southwestern Anthropological Research Group (SARG) data set. */
  readonly sargNumber: number;
  readonly metersNorth: number;
  readonly metersEast: number;
  readonly startDate: number;
  readonly endDate: number;
  /** `1950 - stored value` (the file stores years before present); site 2307 is corrected to 1075. */
  readonly medianDate: number;
  /** Only type 1 (habitation) sites are used by the model. */
  readonly type: number;
  readonly size: number;
  readonly description: number;
  readonly roomCount: number;
  readonly elevation: number;
  /** Households at the site at its median date. */
  readonly baselineHouseholds: number;
}

/** `settlements.bin`: 488 records of twelve shorts each. */
export function decodeSettlements(): HistoricSettlementRecord[] {
  const data = reader(SETTLEMENTS_BIN);
  const records: HistoricSettlementRecord[] = [];
  for (let i = 0; i < SETTLEMENT_RECORDS; i++) {
    const sargNumber = data.readShort();
    const metersNorth = data.readShort();
    const metersEast = data.readShort();
    const startDate = data.readShort();
    const endDate = data.readShort();
    let medianDate = 1950 - data.readShort();
    const type = data.readShort();
    const size = data.readShort();
    const description = data.readShort();
    const roomCount = data.readShort();
    const elevation = data.readShort();
    const baselineHouseholds = data.readShort();
    // "Per C++ code, correct typo in SARG data set" (HistoricSettlement.streamToState).
    if (sargNumber === 2307) medianDate = 1075;
    records.push({
      sargNumber,
      metersNorth,
      metersEast,
      startDate,
      endDate,
      medianDate,
      type,
      size,
      description,
      roomCount,
      elevation,
      baselineHouseholds,
    });
  }
  if (data.remaining !== 0) throw new Error('settlements.bin: unexpected trailing bytes');
  return records;
}

/**
 * Yearly histories per environment zone, each indexed by `year - EARLIEST_YEAR`
 * and by zone 0..5 (general, north, mid, uplands natural, uplands arable,
 * Kinbiko Canyon), assembled as `LHV.importEnvironmentalHistory` does.
 */
export interface EnvironmentHistory {
  /** Palmer Drought Severity Index; 0 before 382. */
  readonly pdsi: readonly Float64Array[];
  /** Hydrologic (erosion) state, 0..10; 0 means low erosion. */
  readonly hydrology: readonly Float64Array[];
  /** Soil aggradation. Read but not used by the model. */
  readonly aggradation: readonly Float64Array[];
  /** Adjusted PDSI, which sets maize yields. */
  readonly apdsi: readonly Float64Array[];
}

/**
 * `environment.bin` and `adjustedPDSI.bin`.
 *
 * `environment.bin`: for each year 200..1499, for zones 0..4: a PDSI float
 * (only from 382 on), then a hydrology float and an aggradation float. Zone 5
 * (Kinbiko Canyon) copies zone 1 (north valley).
 *
 * `adjustedPDSI.bin`: for zones 0..3 in turn, one float per year 200..1499.
 * Zone 4 (uplands arable) copies zone 3 and zone 5 copies zone 1.
 */
export function decodeEnvironment(): EnvironmentHistory {
  const make = (): Float64Array[] =>
    Array.from({ length: HISTORY_ZONES }, () => new Float64Array(YEARS));
  const pdsi = make();
  const hydrology = make();
  const aggradation = make();
  const apdsi = make();
  const env = reader(ENVIRONMENT_BIN);
  for (let year = EARLIEST_YEAR; year <= LATEST_YEAR; year++) {
    const i = year - EARLIEST_YEAR;
    for (let zone = 0; zone < 5; zone++) {
      pdsi[zone]![i] = year >= PDSI_EARLIEST_YEAR ? env.readFloat() : 0;
      hydrology[zone]![i] = env.readFloat();
      aggradation[zone]![i] = env.readFloat();
    }
    pdsi[5]![i] = pdsi[1]![i]!;
    hydrology[5]![i] = hydrology[1]![i]!;
    aggradation[5]![i] = aggradation[1]![i]!;
  }
  if (env.remaining !== 0) throw new Error('environment.bin: unexpected trailing bytes');
  const adjusted = reader(ADJUSTED_PDSI_BIN);
  for (let zone = 0; zone < 4; zone++) {
    for (let i = 0; i < YEARS; i++) apdsi[zone]![i] = adjusted.readFloat();
  }
  if (adjusted.remaining !== 0) throw new Error('adjustedPDSI.bin: unexpected trailing bytes');
  apdsi[4]!.set(apdsi[3]!);
  apdsi[5]!.set(apdsi[1]!);
  return { pdsi, hydrology, aggradation, apdsi };
}

const SITE_2115_X = Math.fround(24.5);
const SITE_2115_Y = Math.fround(37.6);
const METERS_PER_CELL = Math.fround(93.5);

/**
 * Converts surveyed metres to a lattice cell, as `Location.getCoordinateFromMeters`
 * does, anchored on site 2115 (2392 m east, 7954 m north) at cell (24.5, 37.6),
 * 93.5 m per cell, with Java's float arithmetic and truncating int cast. The
 * result may lie off the lattice; callers ignore such records, as the Java did.
 */
export function cellFromMeters(metersNorth: number, metersEast: number): { x: number; y: number } {
  const x = Math.fround(
    SITE_2115_X + Math.fround(Math.fround(metersEast - 2392) / METERS_PER_CELL),
  );
  const y = Math.fround(
    SITE_2115_Y - Math.fround(Math.fround(metersNorth - 7954) / METERS_PER_CELL),
  );
  return { x: Math.trunc(x), y: Math.trunc(y) };
}

/** True if (x, y) lies on the 80 x 120 lattice. */
export function isOnLattice(x: number, y: number): boolean {
  return x >= 0 && x < VALLEY_WIDTH && y >= 0 && y < VALLEY_HEIGHT;
}

/** Every decoded data file. */
export interface LongHouseValleyData {
  /** `map.bin`, see {@link decodeMap}. */
  readonly map: Int16Array;
  /** `water.bin`, see {@link decodeWaterSources}. */
  readonly water: readonly WaterSourceRecord[];
  /** `settlements.bin`, see {@link decodeSettlements}. */
  readonly settlements: readonly HistoricSettlementRecord[];
  /** `environment.bin` and `adjustedPDSI.bin`, see {@link decodeEnvironment}. */
  readonly environment: EnvironmentHistory;
}

let cache: LongHouseValleyData | undefined;

/**
 * All decoded data, decoded once and shared between runs. The returned
 * arrays are never modified by the model.
 */
export function longHouseValleyData(): LongHouseValleyData {
  cache ??= {
    map: decodeMap(),
    water: decodeWaterSources(),
    settlements: decodeSettlements(),
    environment: decodeEnvironment(),
  };
  return cache;
}
