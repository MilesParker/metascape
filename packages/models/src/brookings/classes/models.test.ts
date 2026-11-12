// SPDX-License-Identifier: EPL-2.0
import { Simulation, type Scape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import {
  BargainerTagged,
  DARK_TAG,
  HIGH,
  LIGHT_TAG,
  LOW,
  MEDIUM,
  type Bargainer,
} from './bargaining';
import { family } from './index';

const make = (model: (typeof family.models)[number], seed: number | string = 1) =>
  new Simulation(model as never, { seed, parameters: { population: 60 } as never });
const agents = (sim: Simulation) => [...(sim.scape('agents') as Scape<Bargainer>)];

describe('Emergence of Classes', () => {
  it('has nine models with unique names and provenance', () => {
    expect(family.models).toHaveLength(9);
    expect(new Set(family.models.map((m) => m.name)).size).toBe(9);
    for (const m of family.models) {
      expect(m.provenance?.portedFrom).toContain('edu.brook.classes.');
      expect(m.provenance?.authors).toContain('Axtell');
    }
  });

  for (const model of family.models) {
    describe(model.name, () => {
      it('runs 40 ticks with valid memories', () => {
        const sim = make(model);
        sim.run(40);
        expect(sim.tick).toBe(40);
        for (const a of agents(sim)) {
          expect(a.memorySize).toBeGreaterThanOrEqual(1);
          expect(a.oldestMemory).toBeLessThan(a.memorySize);
          for (const s of a.strategyMemory) expect([LOW, MEDIUM, HIGH]).toContain(s);
          if (a instanceof BargainerTagged) {
            expect(a.opponentMemory).toHaveLength(a.memorySize);
            expect(a.opponentMemory.includes(a)).toBe(false);
          }
        }
        const last = sim.data.latest('low') + sim.data.latest('medium') + sim.data.latest('high');
        expect(last).toBe(60);
      });

      it('is deterministic by seed', () => {
        const run = (seed: number) => {
          const sim = make(model, seed);
          sim.run(30);
          return sim.data.toCSV();
        };
        expect(run(5)).toBe(run(5));
        expect(run(5)).not.toBe(run(6));
      });

      it('only references recorded series in its views', () => {
        const sim = make(model);
        const known = new Set(sim.data.series.map((s) => s.id));
        for (const v of sim.views) {
          if (v.type === 'timeSeries') for (const id of v.series) expect(known.has(id)).toBe(true);
        }
        expect(sim.views.some((v) => v.type === 'continuous')).toBe(true);
      });
    });
  }

  it('Figures 2 and 3 use a memory of exactly 20; figure 3 starts with low or high only', () => {
    const f2 = make(family.models.find((m) => m.name.endsWith('Figure 2'))!);
    expect(agents(f2).every((a) => a.memorySize === 20)).toBe(true);
    const f3 = make(family.models.find((m) => m.name.endsWith('Figure 3'))!);
    for (const a of agents(f3)) expect(a.strategyMemory.includes(MEDIUM)).toBe(false);
  });

  it('applies the start rules of figures 7, 8 and 9', () => {
    const by = (n: string) => make(family.models.find((m) => m.name.endsWith(n))!);
    const tagged = (sim: Simulation) => agents(sim) as BargainerTagged[];
    for (const a of tagged(by('Figure 7'))) {
      if (a.tag !== LIGHT_TAG) continue;
      a.opponentMemory.forEach((o, i) => {
        if (o.tag === LIGHT_TAG) expect(a.strategyMemory[i]).not.toBe(MEDIUM);
      });
    }
    for (const n of ['Figure 8', 'Figure 9']) {
      for (const a of tagged(by(n))) {
        a.opponentMemory.forEach((o, i) => {
          if (o.tag === a.tag) return;
          expect(a.strategyMemory[i]).toBe(a.tag === LIGHT_TAG ? LOW : HIGH);
        });
        if (n === 'Figure 9' && a.tag === LIGHT_TAG) {
          a.opponentMemory.forEach((o, i) => {
            if (o.tag === LIGHT_TAG) expect(a.strategyMemory[i]).not.toBe(MEDIUM);
          });
        }
        expect(a.countIntra() + a.countInter()).toBe(a.memorySize);
      }
    }
    expect(tagged(by('Figure 8')).some((a) => a.tag === DARK_TAG)).toBe(true);
  });

  it('Peyton uses its own payoffs', () => {
    const sim = make(family.models.find((m) => m.name.endsWith('Peyton'))!);
    expect(sim.parameters).toMatchObject({ lowPayoff: 0.1, mediumPayoff: 0.3, highPayoff: 0.5 });
  });

  it('Figure 2 settles on mostly medium (fair) demands', () => {
    const sim = new Simulation(family.models.find((m) => m.name.endsWith('Figure 2')) as never, {
      seed: 3,
    });
    sim.run(600);
    expect(sim.data.latest('medium')).toBeGreaterThan(50);
  });
});
