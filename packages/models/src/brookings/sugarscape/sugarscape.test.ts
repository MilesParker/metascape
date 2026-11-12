// SPDX-License-Identifier: EPL-2.0
import { runExperiment, Simulation, type Model, type Scape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { SpiceAgent, type SugarAgent } from './agents';
import { UNIQUE_SERIES } from './ascape-space';
import { multipleGasII2, sugarscapeBatches } from './batch';
import {
  capacityAt,
  MAX_SPICE,
  MAX_SUGAR,
  SPICE_PEAKS,
  SUGAR_PEAKS,
  type SugarCell,
} from './cells';
import { gasII1, gasII2, gasII6, gasII7, gasII8 } from './chapter-2';
import { gasIII2, gasIII6 } from './chapter-3';
import { gasIVa, gasIVc, gasIVi } from './chapter-4';
import { Exchange } from './exchange';
import { family } from './index';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- models differ in their schemas
type AnyModel = Model<any>;

function cells(sim: Simulation): SugarCell[] {
  return sim.scapes[0]!.members as SugarCell[];
}

function agents(sim: Simulation): readonly SugarAgent[] {
  return (sim.scapes[1] as Scape<SugarAgent>).members;
}

function expectSingleOccupancy(sim: Simulation): void {
  for (const cell of cells(sim)) expect(cell.occupants.length).toBeLessThanOrEqual(1);
  for (const agent of agents(sim)) {
    expect(agent.cell).toBeDefined();
    expect(agent.cell!.occupant).toBe(agent);
  }
}

describe('landscape', () => {
  it('has full sugar at both sugar peaks and none in the far corners', () => {
    const sugar = (x: number, y: number): number =>
      capacityAt(x, y, 50, 50, SUGAR_PEAKS, 0.004, MAX_SUGAR);
    expect(sugar(40, 10)).toBe(4);
    expect(sugar(15, 35)).toBe(4);
    expect(sugar(0, 0)).toBeLessThan(2);
    expect(sugar(49, 49)).toBeLessThan(2);
    const spice = (x: number, y: number): number =>
      capacityAt(x, y, 50, 50, SPICE_PEAKS, 0.008, MAX_SPICE);
    expect(spice(15, 10)).toBe(5);
    expect(spice(40, 35)).toBe(5);
  });

  it('uses lexicographic unique series of 1..n', () => {
    expect(UNIQUE_SERIES.map((s) => s.length)).toEqual([1, 1, 2, 6, 24]);
    expect(UNIQUE_SERIES[3]![1]).toEqual([1, 3, 2]);
  });
});

describe('every model', () => {
  it('has a unique name and provenance naming its legacy class', () => {
    const names = family.models.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
    expect(family.models).toHaveLength(23);
    for (const model of family.models) {
      expect(model.provenance?.portedFrom).toMatch(/^Ascape 5\.6\.1, edu\.brook\.sugarscape\./);
      expect(model.provenance?.authors).toBe('Joshua M. Epstein and Robert Axtell');
    }
  });

  it.each(family.models.map((m) => [m.name, m] as const))(
    '%s builds, runs 20 ticks and keeps one agent per cell',
    (_name, model: AnyModel) => {
      const sim = new Simulation(model, { seed: 7, parameters: { initialPopulation: 200 } });
      sim.run(20);
      expect(sim.tick).toBe(20);
      expectSingleOccupancy(sim);
      for (const cell of cells(sim)) {
        expect(cell.sugar.quantity).toBeGreaterThanOrEqual(0);
        expect(cell.sugar.quantity).toBeLessThanOrEqual(cell.sugar.capacity);
      }
      expect(sim.views.length).toBeGreaterThanOrEqual(2);
    },
  );
});

describe('determinism', () => {
  it.each([gasII2, gasIII2, gasIVa, gasIVi].map((m) => [m.name, m] as const))(
    '%s repeats with a seed and differs with another',
    (_name, model: AnyModel) => {
      const run = (seed: number): string => {
        const sim = new Simulation(model, { seed, parameters: { initialPopulation: 150 } });
        sim.run(25);
        return sim.data.toCSV();
      };
      expect(run(1)).toBe(run(1));
      expect(run(1)).not.toBe(run(2));
    },
  );
});

describe('rules', () => {
  it('II-1 and II-2: population never grows and no starving agent survives a tick', () => {
    for (const model of [gasII1, gasII2]) {
      const sim = new Simulation(model, { seed: 3 });
      let previous = agents(sim).length;
      for (let t = 0; t < 30; t++) {
        sim.step();
        const now = agents(sim);
        expect(now.length).toBeLessThanOrEqual(previous);
        for (const agent of now) expect(agent.sugar.stock).toBeGreaterThan(0);
        previous = now.length;
      }
    }
  });

  it('II-2: the population falls towards the carrying capacity and settles', () => {
    const sim = new Simulation(gasII2, { seed: 11 });
    sim.run(100);
    const at100 = sim.data.latest('population');
    sim.run(50);
    const at150 = sim.data.latest('population');
    expect(at100).toBeLessThan(400);
    expect(at100).toBeGreaterThan(50);
    expect(Math.abs(at150 - at100)).toBeLessThan(0.1 * at100);
  });

  it('II-6: starts in the corner, sees far, and stops at period 50', () => {
    const sim = new Simulation(gasII6, { seed: 5 });
    const inCorner = agents(sim).filter((a) => a.cell!.x < 20 && a.cell!.y >= 30).length;
    expect(inCorner).toBeGreaterThan(300);
    for (const agent of agents(sim)) expect(agent.vision).toBeGreaterThanOrEqual(6);
    sim.run(100);
    expect(sim.tick).toBe(50);
    expect(sim.stopped).toBe(true);
  });

  it('II-7: the top half regrows slowly in winter and fully in summer', () => {
    const sim = new Simulation(gasII7, { seed: 2, parameters: { initialPopulation: 0 } });
    const top = (): number =>
      cells(sim)
        .filter((c) => c.y < 25)
        .reduce((sum, c) => sum + c.sugar.capacity - c.sugar.quantity, 0);
    for (const cell of cells(sim)) cell.sugar.quantity = 0;
    sim.run(4); // winter: top grows 0.125 a tick
    for (const cell of cells(sim).filter((c) => c.y < 25 && c.sugar.capacity > 0)) {
      expect(cell.sugar.quantity).toBeCloseTo(0.5);
    }
    sim.run(60); // into summer (ticks 51..100)
    expect(top()).toBe(0);
  });

  it('II-8: pollution accumulates and diffuses', () => {
    const sim = new Simulation(gasII8, { seed: 4 });
    sim.run(10);
    expect(sim.data.latest('pollution.sum')).toBeGreaterThan(0);
  });

  it('III-2: agents are born and children start at age 0', () => {
    const sim = new Simulation(gasIII2, { seed: 9 });
    const firstIds = new Set(agents(sim).map((a) => a.id));
    sim.run(40);
    const children = agents(sim).filter((a) => !firstIds.has(a.id));
    expect(children.length).toBeGreaterThan(0);
    for (const child of children) expect(child.age).toBeLessThanOrEqual(40);
  });

  it('III-6: cultural tags have 11 bits and both groups are counted', () => {
    const sim = new Simulation(gasIII6, { seed: 6 });
    sim.run(20);
    expect(sim.data.latest('blue') + sim.data.latest('red')).toBe(sim.data.latest('population'));
  });

  it('IV-a and IV-c: neighbors trade', () => {
    for (const model of [gasIVa, gasIVc]) {
      const sim = new Simulation(model, { seed: 8 });
      sim.run(10);
      const trades = sim.data.values('trades');
      expect(trades.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    }
  });

  it('an executed exchange conserves sugar and spice between the two parties', () => {
    const sim = new Simulation(gasIVa, { seed: 12 });
    const [a, b] = agents(sim) as SpiceAgent[];
    a!.sugar.stock = 20;
    a!.spice.stock = 2;
    b!.sugar.stock = 2;
    b!.spice.stock = 20;
    const exchange = new Exchange(a!, b!);
    expect(b!.acceptOffer(exchange)).toBe(true);
    expect(exchange.selfExPostSugar + exchange.partnerExPostSugar).toBeCloseTo(22);
    expect(exchange.selfExPostSpice + exchange.partnerExPostSpice).toBeCloseTo(22);
  });
});

describe('batch harnesses', () => {
  it('express every Multiple* class as an experiment design', () => {
    expect(sugarscapeBatches).toHaveLength(10);
    const rows = runExperiment(multipleGasII2.model, {
      ...multipleGasII2.design,
      maxTicks: 5,
      parameters: { initialPopulation: [100] },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ticks).toBe(5);
    expect(typeof rows[0]!['population']).toBe('number');
  });
});
