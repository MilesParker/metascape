// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import {
  cellFromMeters,
  decodeBase64,
  decodeEnvironment,
  decodeMap,
  decodeSettlements,
  decodeWaterSources,
  EARLIEST_YEAR,
  isOnLattice,
  PDSI_EARLIEST_YEAR,
  YEARS,
} from './decode';

describe('base64', () => {
  it('decodes with and without padding', () => {
    expect([...decodeBase64('AAEC/w==')]).toEqual([0, 1, 2, 255]);
    expect([...decodeBase64('TWFu')]).toEqual([77, 97, 110]);
  });
});

describe('map.bin', () => {
  const map = decodeMap();
  it('holds 80 x 120 zone codes', () => {
    expect(map.length).toBe(9600);
    const counts = new Map<number, number>();
    for (const code of map) counts.set(code, (counts.get(code) ?? 0) + 1);
    // Zone 10 * z plus 5 for sand dunes; only north (15) and mid-valley (25) have dunes; 60 is off the map.
    expect(Object.fromEntries([...counts].sort((a, b) => a[0] - b[0]))).toEqual({
      0: 637,
      10: 328,
      15: 35,
      20: 51,
      25: 15,
      30: 3396,
      40: 145,
      50: 27,
      60: 4966,
    });
  });
});

describe('water.bin', () => {
  const water = decodeWaterSources();
  it('holds the 108 records the Java reads', () => {
    expect(water).toHaveLength(108);
    expect(water[0]).toEqual({
      number: 3,
      metersNorth: 8982,
      metersEast: 4708,
      type: 1,
      startDate: 0,
      endDate: 0,
    });
    const types: Record<number, number> = {};
    for (const record of water) types[record.type] = (types[record.type] ?? 0) + 1;
    expect(types).toEqual({ 1: 56, 2: 38, 3: 12, 4: 2 });
  });
  it('places all but two records on the lattice', () => {
    const on = water.filter((r) => {
      const { x, y } = cellFromMeters(r.metersNorth, r.metersEast);
      return isOnLattice(x, y);
    });
    expect(on).toHaveLength(106);
    expect(cellFromMeters(8982, 4708)).toEqual({ x: 49, y: 26 });
  });
});

describe('settlements.bin', () => {
  const settlements = decodeSettlements();
  it('holds the 488 SARG records the Java reads', () => {
    expect(settlements).toHaveLength(488);
    expect(settlements[0]).toMatchObject({
      sargNumber: 2000,
      startDate: 1000,
      endDate: 1100,
      medianDate: 1950 - 875,
      type: -1,
      baselineHouseholds: 1,
    });
    const types: Record<number, number> = {};
    for (const record of settlements) types[record.type] = (types[record.type] ?? 0) + 1;
    expect(types).toEqual({ '-1': 9, 1: 235, 2: 244 });
  });
  it('corrects the median date of site 2307 as the Java does', () => {
    expect(settlements.find((s) => s.sargNumber === 2307)?.medianDate).toBe(1075);
  });
  it('dates habitation sites between AD 400 and 1300', () => {
    const habitations = settlements.filter((s) => s.type === 1);
    expect(Math.min(...habitations.map((s) => s.startDate))).toBe(400);
    expect(Math.max(...habitations.map((s) => s.endDate))).toBe(1300);
    for (const s of habitations) expect(s.baselineHouseholds).toBeGreaterThanOrEqual(1);
  });
});

describe('environment.bin and adjustedPDSI.bin', () => {
  const env = decodeEnvironment();
  it('covers 1300 years for six zones', () => {
    expect(YEARS).toBe(1300);
    for (const series of [env.pdsi, env.hydrology, env.aggradation, env.apdsi]) {
      expect(series).toHaveLength(6);
      for (const zone of series) expect(zone).toHaveLength(1300);
    }
  });
  it('has no PDSI before AD 382 and plausible ranges after', () => {
    for (let zone = 0; zone < 6; zone++) {
      for (let year = EARLIEST_YEAR; year < PDSI_EARLIEST_YEAR; year++) {
        expect(env.pdsi[zone]![year - EARLIEST_YEAR]).toBe(0);
      }
      for (const h of env.hydrology[zone]!) expect(h >= 0 && h <= 10).toBe(true);
      for (const a of env.apdsi[zone]!) expect(a > -6 && a < 8.1).toBe(true);
    }
  });
  it('copies zones as the Java does', () => {
    expect([...env.pdsi[5]!]).toEqual([...env.pdsi[1]!]);
    expect([...env.hydrology[5]!]).toEqual([...env.hydrology[1]!]);
    expect([...env.apdsi[4]!]).toEqual([...env.apdsi[3]!]);
    expect([...env.apdsi[5]!]).toEqual([...env.apdsi[1]!]);
    expect(env.apdsi[0]![800 - EARLIEST_YEAR]).toBeCloseTo(3.869, 3);
  });
});
