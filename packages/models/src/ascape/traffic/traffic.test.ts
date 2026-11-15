// SPDX-License-Identifier: EPL-2.0
import { RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { family } from './index';
import { Car, CELL_LENGTH, HIGHWAY_LENGTH, LANES, trafficModel, type RoadTile } from './traffic';

const make = (seed: number | string = 1, parameters: Record<string, number> = {}) =>
  new RootScape(trafficModel, { seed, parameters });
const carsOf = (root: RootScape): readonly Car[] => root.findScape<Car>('Cars').members;

describe('Traffic Model (Ascape)', () => {
  it('is registered in its family', () => {
    expect(family.models).toEqual([trafficModel]);
    expect(family.id).toBe('ascape-traffic');
  });

  it('starts with 240 cars on distinct tiles, all defectors, at location 0', () => {
    const root = make();
    const cars = carsOf(root);
    expect(cars).toHaveLength(240);
    expect(new Set(cars.map((c) => c.hostCell)).size).toBe(240);
    for (const c of cars) {
      expect(c.behavior).toBe('defector');
      expect(c.location).toBe(0);
      expect(c.actualSpeed).toBe(c.desiredSpeed);
      expect(c.desiredSpeed).toBeGreaterThanOrEqual(60);
      expect(c.desiredSpeed).toBeLessThan(90);
      expect(c.safeDistance).toBeGreaterThanOrEqual(1);
      expect(c.safeDistance).toBeLessThan(3);
    }
  });

  it('runs 100 periods and records the series its views use', () => {
    const root = make();
    expect(root.run(100)).toBe(100);
    const known = new Set(root.data.series.map((s) => s.id));
    for (const v of root.allViews) {
      if (v.type === 'timeSeries') for (const id of v.series) expect(known.has(id)).toBe(true);
    }
    expect(root.allViews.some((v) => v.type === 'grid')).toBe(true);
  });

  it('is deterministic for a seed and differs between seeds', () => {
    const run = (seed: number) => {
      const root = make(seed);
      root.run(60);
      return root.data.toCSV();
    };
    expect(run(3)).toBe(run(3));
    expect(run(3)).not.toBe(run(4));
  });

  it('keeps cars, single occupancy and bounded speed and location', () => {
    const root = make(7, { portionCooperator: 0.5 });
    for (let t = 0; t < 100; t++) {
      root.iterate();
      const cars = carsOf(root);
      expect(cars).toHaveLength(240);
      expect(new Set(cars.map((c) => c.hostCell as RoadTile)).size).toBe(240);
      for (const c of cars) {
        expect(c.actualSpeed).toBeGreaterThanOrEqual(0);
        expect(c.actualSpeed).toBeLessThanOrEqual(90 + 3);
        expect(c.location).toBeGreaterThanOrEqual(0);
        expect(c.location).toBeLessThanOrEqual(CELL_LENGTH);
        expect(c.hostCell!.x).toBeLessThan(HIGHWAY_LENGTH);
        expect(c.hostCell!.y).toBeLessThan(LANES);
      }
    }
  });

  it('portionCooperator sets behavior and zero density gives no cars', () => {
    const root = make(2, { portionCooperator: 1 });
    expect(carsOf(root).every((c) => c.behavior === 'cooperator')).toBe(true);
    const sim0 = make(2, { trafficDensity: 0 });
    expect(carsOf(sim0)).toHaveLength(0);
    sim0.run(5);
  });

  it('a lone car cruises at its desired speed and advances a tile each time its location reaches 160 (remainder is dropped)', () => {
    const root = make(4, { trafficDensity: 1 / 480 });
    const cars = carsOf(root);
    expect(cars).toHaveLength(1);
    const car = cars[0]!;
    const x0 = car.hostCell!.x;
    const lane = car.hostCell!.y;
    const speed = car.desiredSpeed;
    root.run(100);
    expect(car.actualSpeed).toBe(speed);
    expect(car.hostCell!.y).toBe(lane);
    const travelled = Math.floor(100 / Math.ceil(CELL_LENGTH / speed));
    expect(car.hostCell!.x).toBe((x0 + travelled) % HIGHWAY_LENGTH);
  });

  it('jams with density: heavier traffic is slower and more frustrated', () => {
    const run = (trafficDensity: number) => {
      const root = make(1, { trafficDensity });
      root.run(300);
      return {
        speed: root.data.latest('speed.mean'),
        frustration: root.data.latest('frustration.mean'),
      };
    };
    const light = run(0.1);
    const heavy = run(0.8);
    expect(heavy.speed).toBeLessThan(light.speed);
    expect(heavy.frustration).toBeGreaterThan(light.frustration);
  });
});
