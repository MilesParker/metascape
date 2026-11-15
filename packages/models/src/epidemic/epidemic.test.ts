// SPDX-License-Identifier: EPL-2.0
import { ParameterError, RootScape, type ViewSpec } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { epidemic } from './epidemic';

type Params = Partial<RootScape<typeof epidemic.parameters>['parameters']>;
const make = (seed: number | string = 1, parameters: Params = {}) =>
  new RootScape(epidemic, { seed, parameters });
const total = (root: RootScape) =>
  root.data.latest('susceptible') + root.data.latest('infected') + root.data.latest('recovered');

describe('epidemic', () => {
  it('runs 200 iterations with defaults', () => {
    const root = make();
    root.run(200);
    expect(root.data.latest('everInfected')).toBeGreaterThan(5);
  });

  it('is reproducible by seed', () => {
    const run = (seed: number) => {
      const root = make(seed);
      root.run(200);
      return root.data.toCSV();
    };
    expect(run(2)).toBe(run(2));
    expect(run(2)).not.toBe(run(3));
  });

  it('only references recorded series and distributions in its views', () => {
    const root = make();
    const known = new Set(root.data.series.map((s) => s.id));
    const views: readonly ViewSpec[] = root.allViews;
    expect(views.length).toBeGreaterThan(0);
    for (const view of views) {
      if (view.type === 'timeSeries' || view.type === 'bars') {
        for (const id of view.series) expect(known.has(id)).toBe(true);
      }
      if (view.type === 'histogram') {
        expect(() => root.data.distributionCounts(view.distribution)).not.toThrow();
      }
    }
  });

  it('rejects parameters outside their ranges', () => {
    expect(() => make(1, { transmission: 1.2 })).toThrow(ParameterError);
    expect(() => make(1, { infectiousPeriod: 0 })).toThrow(ParameterError);
    expect(() => make(1, { population: 5 })).toThrow(ParameterError);
  });

  it('conserves the population', () => {
    const root = make(5, { immunityPeriod: 10 });
    expect(total(root)).toBe(500);
    for (let t = 0; t < 150; t++) {
      root.iterate();
      expect(total(root)).toBe(500);
    }
  });

  it('infects nobody new with zero transmission', () => {
    const root = make(2, { transmission: 0, initialInfected: 7 });
    root.run(100);
    expect(root.data.latest('everInfected')).toBe(7);
    expect(root.data.latest('recovered')).toBe(7);
  });

  it('never decreases recovered with permanent immunity, and stops when no one is infected', () => {
    const root = make(9, { transmission: 0.3 });
    root.run(1000);
    const recovered = root.data.values('recovered');
    for (let i = 1; i < recovered.length; i++) {
      expect(recovered[i]!).toBeGreaterThanOrEqual(recovered[i - 1]!);
    }
    expect(root.stopped).toBe(true);
    expect(root.stopReason).toBeDefined();
    expect(root.data.latest('infected')).toBe(0);
    expect(root.data.latest('recovered')).toBe(root.data.latest('everInfected'));
  });

  it('lets recovered people become susceptible again when immunity wanes', () => {
    const root = make(4, { immunityPeriod: 5, transmission: 0.3 });
    root.run(60);
    const recovered = [...root.data.values('recovered')];
    expect(recovered.some((value, i) => i > 0 && value < recovered[i - 1]!)).toBe(true);
  });
});
