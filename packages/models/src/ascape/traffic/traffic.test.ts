// SPDX-License-Identifier: EPL-2.0
import { Simulation, type Scape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { family } from './index';
import { Car, CELL_LENGTH, HIGHWAY_LENGTH, LANES, trafficModel, type RoadTile } from './traffic';

const make = (seed: number | string = 1, parameters: Record<string, number> = {}) =>
  new Simulation(trafficModel, { seed, parameters });
const carsOf = (sim: Simulation): readonly Car[] => (sim.scape('Cars') as Scape<Car>).members;

describe('Traffic Model (Ascape)', () => {
  it('is registered in its family', () => {
    expect(family.models).toEqual([trafficModel]);
    expect(family.id).toBe('ascape-traffic');
  });

  it('starts with 240 cars on distinct tiles, all defectors, at location 0', () => {
    const sim = make();
    const cars = carsOf(sim);
    expect(cars).toHaveLength(240);
    expect(new Set(cars.map((c) => c.cell)).size).toBe(240);
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

  it('runs 100 ticks and records the series its views use', () => {
    const sim = make();
    expect(sim.run(100)).toBe(100);
    const known = new Set(sim.data.series.map((s) => s.id));
    for (const v of sim.views) {
      if (v.type === 'timeSeries') for (const id of v.series) expect(known.has(id)).toBe(true);
    }
    expect(sim.views.some((v) => v.type === 'grid')).toBe(true);
  });

  it('is deterministic for a seed and differs between seeds', () => {
    const run = (seed: number) => {
      const sim = make(seed);
      sim.run(60);
      return sim.data.toCSV();
    };
    expect(run(3)).toBe(run(3));
    expect(run(3)).not.toBe(run(4));
  });

  it('keeps cars, single occupancy and bounded speed and location', () => {
    const sim = make(7, { portionCooperator: 0.5 });
    for (let t = 0; t < 100; t++) {
      sim.step();
      const cars = carsOf(sim);
      expect(cars).toHaveLength(240);
      expect(new Set(cars.map((c) => c.cell as RoadTile)).size).toBe(240);
      for (const c of cars) {
        expect(c.actualSpeed).toBeGreaterThanOrEqual(0);
        expect(c.actualSpeed).toBeLessThanOrEqual(90 + 3);
        expect(c.location).toBeGreaterThanOrEqual(0);
        expect(c.location).toBeLessThanOrEqual(CELL_LENGTH);
        expect(c.cell!.x).toBeLessThan(HIGHWAY_LENGTH);
        expect(c.cell!.y).toBeLessThan(LANES);
      }
    }
  });

  it('portionCooperator sets behavior and zero density gives no cars', () => {
    const sim = make(2, { portionCooperator: 1 });
    expect(carsOf(sim).every((c) => c.behavior === 'cooperator')).toBe(true);
    const sim0 = make(2, { trafficDensity: 0 });
    expect(carsOf(sim0)).toHaveLength(0);
    sim0.run(5);
  });

  it('a lone car cruises at its desired speed and advances a tile each time its location reaches 160 (remainder is dropped)', () => {
    const sim = make(4, { trafficDensity: 1 / 480 });
    const cars = carsOf(sim);
    expect(cars).toHaveLength(1);
    const car = cars[0]!;
    const x0 = car.cell!.x;
    const lane = car.cell!.y;
    const speed = car.desiredSpeed;
    sim.run(100);
    expect(car.actualSpeed).toBe(speed);
    expect(car.cell!.y).toBe(lane);
    const travelled = Math.floor(100 / Math.ceil(CELL_LENGTH / speed));
    expect(car.cell!.x).toBe((x0 + travelled) % HIGHWAY_LENGTH);
  });

  it('jams with density: heavier traffic is slower and more frustrated', () => {
    const run = (trafficDensity: number) => {
      const sim = make(1, { trafficDensity });
      sim.run(300);
      return {
        speed: sim.data.latest('speed.mean'),
        frustration: sim.data.latest('frustration.mean'),
      };
    };
    const light = run(0.1);
    const heavy = run(0.8);
    expect(heavy.speed).toBeLessThan(light.speed);
    expect(heavy.frustration).toBeGreaterThan(light.frustration);
  });
});
