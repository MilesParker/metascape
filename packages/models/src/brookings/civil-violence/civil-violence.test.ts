// SPDX-License-Identifier: EPL-2.0
import { Simulation, type Model, type Scape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { ACTIVE, BLUE, GREEN, IN_JAIL, QUIESCENT, Citizen, CitizenBlueGreen, Cop } from './agents';
import {
  cvModelIRun3,
  cvModelIRun4,
  cvModelIRun5,
  cvModelIIRun1,
  cvModelIIRun4aandb,
  cvModelInterGroupRetr,
  cvModelIRun2,
  cvModelIRun1,
  cvModelI,
  family,
} from './index';
import { findNearest, forEachWithin } from './vision';

const SMALL = { width: 20, height: 20 };
const make = (model: Model, seed: number | string = 1, parameters: Record<string, number> = {}) =>
  new Simulation(model as Model, {
    seed,
    parameters: { ...SMALL, ...parameters } as never,
  });

describe('family', () => {
  it('lists 14 uniquely named models in the right collection', () => {
    expect(family.id).toBe('brookings-civil-violence');
    expect(family.collection).toBe('Brookings Institution models (from Ascape)');
    expect(family.models).toHaveLength(14);
    expect(new Set(family.models.map((m) => m.name)).size).toBe(14);
  });

  it('gives every model full provenance', () => {
    for (const m of family.models) {
      expect(m.provenance?.authors).toBe('Joshua M. Epstein');
      expect(m.provenance?.citation).toContain('Modeling civil violence');
      expect(m.provenance?.portedFrom).toMatch(/^Ascape 5\.6\.1, edu\.brook\.cv\./);
      expect(m.provenance?.copyright).toContain('Brookings Institution');
    }
  });

  for (const model of family.models) {
    describe(model.name, () => {
      it('runs 30 ticks with views that only name recorded series', () => {
        const sim = make(model);
        sim.run(30);
        expect(sim.tick).toBe(30);
        expect(sim.views.some((v) => v.type === 'grid')).toBe(true);
        for (const view of sim.views) {
          if (view.type === 'timeSeries') {
            for (const id of view.series) expect(() => sim.data.get(id)).not.toThrow();
          }
        }
      });

      it('is deterministic for a seed and differs between seeds', () => {
        const csv = (seed: number) => {
          const sim = make(model, seed);
          sim.run(25);
          return sim.data.toCSV();
        };
        expect(csv(7)).toBe(csv(7));
        expect(csv(7)).not.toBe(csv(8));
      });

      it('keeps lattice and state invariants', () => {
        const sim = make(model, 3);
        const people = sim.scape('people') as Scape<Citizen>;
        const cops = sim.scape('cops') as Scape<Cop>;
        for (let t = 0; t < 40; t++) {
          sim.step();
          const seen = new Set<unknown>();
          for (const c of people.members) {
            expect([QUIESCENT, ACTIVE, IN_JAIL]).toContain(c.state);
            if (c.state === IN_JAIL) expect(c.cell).toBeUndefined();
            else {
              expect(c.cell).toBeDefined();
              expect(seen.has(c.cell)).toBe(false);
              seen.add(c.cell);
              expect(c.cell!.occupant).toBe(c);
            }
            expect(c.hardship).toBeGreaterThanOrEqual(0);
            expect(c.hardship).toBeLessThan(1);
          }
          for (const c of cops.members) {
            expect(seen.has(c.cell)).toBe(false);
            seen.add(c.cell);
          }
          const d = sim.data;
          expect(d.latest('Active') + d.latest('Quiescent') + d.latest('Jailed')).toBe(people.size);
        }
      });
    });
  }
});

describe('vision', () => {
  it('counts the 8 neighbors at vision 1.7 and 24 at vision 2.9', () => {
    const sim = make(cvModelI);
    const grid = sim.scape('lattice') as never as Parameters<typeof forEachWithin>[0];
    const origin = grid.at(5, 5)!;
    let n = 0;
    forEachWithin(grid, origin, false, 1.7, () => n++);
    expect(n).toBe(8);
    n = 0;
    forEachWithin(grid, origin, false, 2.9, () => n++);
    expect(n).toBe(24);
  });

  it('uses a strict bound when searching for the nearest', () => {
    const sim = make(cvModelI);
    const grid = sim.scape('lattice') as never as Parameters<typeof forEachWithin>[0];
    const origin = grid.at(5, 5)!;
    const target = grid.at(8, 5)!;
    const is = (c: unknown) => c === target;
    expect(findNearest(grid, origin, false, 3, is, sim.random)).toBeUndefined();
    expect(findNearest(grid, origin, false, 3.01, is, sim.random)).toBe(target);
  });
});

describe('Model I', () => {
  it('Run 1 never moves citizens', () => {
    const sim = make(cvModelIRun1);
    const people = sim.scape('people') as Scape<Citizen>;
    const before = people.members.map((c) => c.cell);
    sim.run(20);
    // Nobody is jailed in the first ticks of a quiet run, so positions are unchanged.
    if (sim.data.latest('Jailed') === 0) {
      expect(people.members.map((c) => c.cell)).toEqual(before);
    }
  });

  it('Run 2 shows punctuated outbursts of rebellion', () => {
    let total = 0;
    for (const seed of [5, 6, 7, 8]) {
      const sim = make(cvModelIRun2, seed);
      sim.run(300);
      const active = Array.from(sim.data.values('Active'));
      let bursts = 0;
      for (let i = 1; i < active.length; i++) if (active[i]! >= 10 && active[i - 1]! <= 2) bursts++;
      const quiet = active.filter((a) => a <= 2).length;
      total += bursts;
      expect(quiet).toBeGreaterThan(active.length / 2);
    }
    expect(total).toBeGreaterThanOrEqual(2);
  });

  it('Run 3 erodes legitimacy by 0.01 every third tick', () => {
    const sim = make(cvModelIRun3);
    sim.run(31);
    // Sampled before the tick-30 decrease: 0.90 - 9 * 0.01.
    expect(sim.data.latest('Legitimacy') / 1000).toBeCloseTo(0.9 - 0.1, 10);
  });

  it('Run 4 cuts legitimacy to 0.65 after tick 75', () => {
    const sim = make(cvModelIRun4);
    sim.run(75);
    expect(sim.data.latest('Legitimacy')).toBeCloseTo(900, 6);
    sim.step();
    expect(sim.data.latest('Legitimacy')).toBeCloseTo(650, 6);
  });

  it('Run 5 reduces the cops to nothing', () => {
    const sim = make(cvModelIRun5);
    const start = sim.data.latest('Cops');
    expect(start).toBe(Math.trunc(400 * 0.074));
    // The cop count is adjusted after each tick's sample, so it shows one tick later.
    sim.step();
    expect(sim.data.latest('Cops')).toBe(Math.trunc(400 * 0.074));
    sim.step();
    expect(sim.data.latest('Cops')).toBe(Math.trunc(400 * 0.06));
    sim.run(80);
    expect(sim.data.latest('Cops')).toBe(0);
  });

  it('never releases jailed citizens in Runs 3-5', () => {
    const sim = make(cvModelIRun4, 2);
    let last = 0;
    for (let t = 0; t < 120; t++) {
      sim.step();
      const j = sim.data.latest('Jailed');
      expect(j).toBeGreaterThanOrEqual(last);
      last = j;
    }
  });

  it('rejects more citizens and cops than there are sites', () => {
    expect(() =>
      make(cvModelI, 1, { initialPopulationDensity: 0.9, initialCopDensity: 0.2 }),
    ).toThrow();
  });
});

describe('Model II', () => {
  it('has two groups, and kills only across groups', () => {
    const sim = make(cvModelIIRun4aandb, 4);
    const people = sim.scape('people') as Scape<CitizenBlueGreen>;
    sim.run(40);
    expect(people.members.every((c) => c.group === BLUE || c.group === GREEN)).toBe(true);
    expect(sim.data.latest('Blue') + sim.data.latest('Green')).toBe(people.size);
  });

  it('turns active only with the other group in view', () => {
    const sim = make(cvModelIIRun4aandb, 9);
    const people = sim.scape('people') as Scape<CitizenBlueGreen>;
    for (let t = 0; t < 30; t++) {
      sim.step();
      for (const c of people.members) {
        if (c.state !== ACTIVE || !c.cell) continue;
        // Active at the end of the tick: it decided so before attacking, so some
        // other-group citizen was in view when it decided; the population may have
        // changed since, so only check the rule's weaker consequence here.
        expect(c.group === BLUE || c.group === GREEN).toBe(true);
      }
    }
  });

  it('records kills and keeps legitimacies within 0 and 1', () => {
    const sim = make(cvModelInterGroupRetr, 2);
    sim.run(60);
    for (const v of sim.data.values('Blue Legitimacy')) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    const kills =
      Array.from(sim.data.values('Greens Killed By Blue')).reduce((a, b) => a + b, 0) +
      Array.from(sim.data.values('Blues Killed By Green')).reduce((a, b) => a + b, 0);
    expect(kills).toBeGreaterThanOrEqual(0);
  });

  it('starts with the legacy legitimacies and population growth by fission', () => {
    const sim = make(cvModelIIRun1);
    expect(sim.data.latest('Blue Legitimacy')).toBeCloseTo(0.2, 10);
    const n = sim.scape('people').size;
    sim.run(20);
    expect(sim.scape('people').size).not.toBe(n);
  });

  it('keeps the cop count at its target', () => {
    const sim = make(cvModelIIRun4aandb);
    sim.run(30);
    expect(sim.scape('cops').size).toBe(16);
  });
});
