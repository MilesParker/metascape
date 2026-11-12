// SPDX-License-Identifier: EPL-2.0
import { ParameterError, Simulation, type ViewSpec } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { epidemic } from './epidemic';

type Params = Partial<Simulation<typeof epidemic.parameters>['parameters']>;
const make = (seed: number | string = 1, parameters: Params = {}) =>
  new Simulation(epidemic, { seed, parameters });
const total = (sim: Simulation) =>
  sim.data.latest('susceptible') + sim.data.latest('infected') + sim.data.latest('recovered');

describe('epidemic', () => {
  it('runs 200 ticks with defaults', () => {
    const sim = make();
    sim.run(200);
    expect(sim.data.latest('everInfected')).toBeGreaterThan(5);
  });

  it('is reproducible by seed', () => {
    const run = (seed: number) => {
      const sim = make(seed);
      sim.run(200);
      return sim.data.toCSV();
    };
    expect(run(2)).toBe(run(2));
    expect(run(2)).not.toBe(run(3));
  });

  it('only references recorded series and distributions in its views', () => {
    const sim = make();
    const known = new Set(sim.data.series.map((s) => s.id));
    const views: ViewSpec[] = epidemic.views!(sim);
    expect(views.length).toBeGreaterThan(0);
    for (const view of views) {
      if (view.type === 'timeSeries' || view.type === 'bars') {
        for (const id of view.series) expect(known.has(id)).toBe(true);
      }
      if (view.type === 'histogram') {
        expect(() => sim.data.distributionCounts(view.distribution)).not.toThrow();
      }
    }
  });

  it('rejects parameters outside their ranges', () => {
    expect(() => make(1, { transmission: 1.2 })).toThrow(ParameterError);
    expect(() => make(1, { infectiousPeriod: 0 })).toThrow(ParameterError);
    expect(() => make(1, { population: 5 })).toThrow(ParameterError);
  });

  it('conserves the population', () => {
    const sim = make(5, { immunityPeriod: 10 });
    expect(total(sim)).toBe(500);
    for (let t = 0; t < 150; t++) {
      sim.step();
      expect(total(sim)).toBe(500);
    }
  });

  it('infects nobody new with zero transmission', () => {
    const sim = make(2, { transmission: 0, initialInfected: 7 });
    sim.run(100);
    expect(sim.data.latest('everInfected')).toBe(7);
    expect(sim.data.latest('recovered')).toBe(7);
  });

  it('never decreases recovered with permanent immunity, and stops when no one is infected', () => {
    const sim = make(9, { transmission: 0.3 });
    sim.run(1000);
    const recovered = sim.data.values('recovered');
    for (let i = 1; i < recovered.length; i++) {
      expect(recovered[i]!).toBeGreaterThanOrEqual(recovered[i - 1]!);
    }
    expect(sim.stopped).toBe(true);
    expect(sim.stopReason).toBeDefined();
    expect(sim.data.latest('infected')).toBe(0);
    expect(sim.data.latest('recovered')).toBe(sim.data.latest('everInfected'));
  });

  it('lets recovered people become susceptible again when immunity wanes', () => {
    const sim = make(4, { immunityPeriod: 5, transmission: 0.3 });
    sim.run(60);
    const recovered = [...sim.data.values('recovered')];
    expect(recovered.some((value, i) => i > 0 && value < recovered[i - 1]!)).toBe(true);
  });
});
