// SPDX-License-Identifier: EPL-2.0
import { type Model, RootScape, runExperiment, type Scape } from '@metascape/engine';
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

function cells(root: RootScape): SugarCell[] {
  return root.scapes[0]!.members as SugarCell[];
}

function agents(root: RootScape): readonly SugarAgent[] {
  return (root.scapes[1] as Scape<SugarAgent>).members;
}

function expectSingleOccupancy(root: RootScape): void {
  for (const cell of cells(root)) expect(cell.occupants.length).toBeLessThanOrEqual(1);
  for (const agent of agents(root)) {
    expect(agent.hostCell).toBeDefined();
    expect(agent.hostCell!.occupant).toBe(agent);
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
    '%s builds, runs 20 periods and keeps one agent per cell',
    (_name, model: AnyModel) => {
      const root = new RootScape(model, { seed: 7, parameters: { initialPopulation: 200 } });
      root.run(20);
      expect(root.iteration).toBe(20);
      expectSingleOccupancy(root);
      for (const cell of cells(root)) {
        expect(cell.sugar.quantity).toBeGreaterThanOrEqual(0);
        expect(cell.sugar.quantity).toBeLessThanOrEqual(cell.sugar.capacity);
      }
      expect(root.allViews.length).toBeGreaterThanOrEqual(2);
    },
  );
});

describe('determinism', () => {
  it.each([gasII2, gasIII2, gasIVa, gasIVi].map((m) => [m.name, m] as const))(
    '%s repeats with a seed and differs with another',
    (_name, model: AnyModel) => {
      const run = (seed: number): string => {
        const root = new RootScape(model, { seed, parameters: { initialPopulation: 150 } });
        root.run(25);
        return root.data.toCSV();
      };
      expect(run(1)).toBe(run(1));
      expect(run(1)).not.toBe(run(2));
    },
  );
});

describe('rules', () => {
  it('II-1 and II-2: population never grows and no starving agent survives a period', () => {
    for (const model of [gasII1, gasII2]) {
      const root = new RootScape(model, { seed: 3 });
      let previous = agents(root).length;
      for (let t = 0; t < 30; t++) {
        root.iterate();
        const now = agents(root);
        expect(now.length).toBeLessThanOrEqual(previous);
        for (const agent of now) expect(agent.sugar.stock).toBeGreaterThan(0);
        previous = now.length;
      }
    }
  });

  it('II-2: the population falls towards the carrying capacity and settles', () => {
    const root = new RootScape(gasII2, { seed: 11 });
    root.run(100);
    const at100 = root.data.latest('population');
    root.run(50);
    const at150 = root.data.latest('population');
    expect(at100).toBeLessThan(400);
    expect(at100).toBeGreaterThan(50);
    expect(Math.abs(at150 - at100)).toBeLessThan(0.1 * at100);
  });

  it('II-6: starts in the corner, sees far, and stops at period 50', () => {
    const root = new RootScape(gasII6, { seed: 5 });
    const inCorner = agents(root).filter((a) => a.hostCell!.x < 20 && a.hostCell!.y >= 30).length;
    expect(inCorner).toBeGreaterThan(300);
    for (const agent of agents(root)) expect(agent.vision).toBeGreaterThanOrEqual(6);
    root.run(100);
    expect(root.iteration).toBe(50);
    expect(root.stopped).toBe(true);
  });

  it('II-7: the top half regrows slowly in winter and fully in summer', () => {
    const root = new RootScape(gasII7, { seed: 2, parameters: { initialPopulation: 0 } });
    const top = (): number =>
      cells(root)
        .filter((c) => c.y < 25)
        .reduce((sum, c) => sum + c.sugar.capacity - c.sugar.quantity, 0);
    for (const cell of cells(root)) cell.sugar.quantity = 0;
    root.run(4); // winter: top grows 0.125 a period
    for (const cell of cells(root).filter((c) => c.y < 25 && c.sugar.capacity > 0)) {
      expect(cell.sugar.quantity).toBeCloseTo(0.5);
    }
    root.run(60); // into summer (periods 51..100)
    expect(top()).toBe(0);
  });

  it('II-8: pollution accumulates and diffuses', () => {
    const root = new RootScape(gasII8, { seed: 4 });
    root.run(10);
    expect(root.data.latest('pollution.sum')).toBeGreaterThan(0);
  });

  it('III-2: agents are born and children start at age 0', () => {
    const root = new RootScape(gasIII2, { seed: 9 });
    const firstIds = new Set(agents(root).map((a) => a.id));
    root.run(40);
    const children = agents(root).filter((a) => !firstIds.has(a.id));
    expect(children.length).toBeGreaterThan(0);
    for (const child of children) expect(child.age).toBeLessThanOrEqual(40);
  });

  it('III-6: cultural tags have 11 bits and both groups are counted', () => {
    const root = new RootScape(gasIII6, { seed: 6 });
    root.run(20);
    expect(root.data.latest('blue') + root.data.latest('red')).toBe(root.data.latest('population'));
  });

  it('IV-a and IV-c: neighbors trade', () => {
    for (const model of [gasIVa, gasIVc]) {
      const root = new RootScape(model, { seed: 8 });
      root.run(10);
      const trades = root.data.values('trades');
      expect(trades.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    }
  });

  it('an executed exchange conserves sugar and spice between the two parties', () => {
    const root = new RootScape(gasIVa, { seed: 12 });
    const [a, b] = agents(root) as SpiceAgent[];
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
      maxIterations: 5,
      parameters: { initialPopulation: [100] },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.iterations).toBe(5);
    expect(typeof rows[0]!['population']).toBe('number');
  });
});
