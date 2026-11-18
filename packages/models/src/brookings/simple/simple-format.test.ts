// SPDX-License-Identifier: EPL-2.0
import { RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { simple } from './simple';
import { simpleFormat } from './index';

const make = (seed: number, numberOfAgents = 2) =>
  new RootScape(simpleFormat as never, { seed, parameters: { numberOfAgents } });

describe('Simple (format)', () => {
  it('has a subject and one agent fewer than the number of agents as environment', () => {
    const root = make(1, 5);
    root.run(1);
    expect(root.data.latest('subject.count')).toBe(1);
    expect(root.data.latest('environment.count')).toBe(4);
    const alone = make(1, 1);
    alone.run(1);
    expect(alone.data.latest('environment.count')).toBe(0);
  });

  it('doubles the subject, capped, when it is alone', () => {
    const root = make(1, 1);
    root.run(12);
    expect(root.data.latest('subject.happiness.max')).toBe(1000);
    root.run(1);
    expect(root.data.latest('subject.happiness.max')).toBe(1000);
  });

  it('is deterministic by seed', () => {
    const csv = (seed: number) => {
      const root = make(seed, 5);
      root.run(60);
      return root.data.toCSV();
    };
    expect(csv(2)).toBe(csv(2));
    expect(csv(2)).not.toBe(csv(3));
  });

  it('keeps happiness within bounds and breaks it from time to time', () => {
    const root = make(7, 2);
    let breaks = 0;
    let previous = 3;
    for (let t = 0; t < 200; t++) {
      root.iterate();
      const h = root.data.latest('subject.happiness.max');
      expect(h).toBeGreaterThanOrEqual(3);
      expect(h).toBeLessThanOrEqual(1000);
      if (h === 3 && previous !== 3) breaks++;
      previous = h;
    }
    expect(breaks).toBeGreaterThan(5);
  });

  it('charts the happiness it records', () => {
    const root = make(1);
    const known = new Set(root.data.series.map((s) => s.id));
    const charts = root.allViews.filter((v) => v.type === 'timeSeries');
    expect(charts).toHaveLength(1);
    for (const v of charts) for (const id of v.series) expect(known.has(id)).toBe(true);
  });

  /*
   * Statistical equivalence with the coded port (they draw their random numbers
   * differently, so only distributions can agree). For each of 100 seeds, both
   * run 80 periods, and the happiness of the subject is averaged over the
   * periods; with 2 and with 6 agents. Across seeds the means of the two
   * versions must differ by less than four standard errors of their
   * difference, and the spreads by less than a factor of three. Happiness is
   * a power of two times 3, so the fraction of periods spent at the ceiling of
   * 1000 is compared too.
   */
  const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);
  const PERIODS = 80;

  const summary = (samples: readonly number[]) => {
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / (samples.length - 1);
    return { mean, sd: Math.sqrt(variance) };
  };

  const runOf = (model: object, series: string, seed: number, agents: number) => {
    const root = new RootScape(model as never, {
      seed,
      parameters: { numberOfAgents: agents } as never,
    });
    const values: number[] = [];
    for (let t = 0; t < PERIODS; t++) {
      root.run(1);
      values.push(root.data.latest(series));
    }
    return values;
  };

  const compare = (agents: number) => {
    const coded = SEEDS.map((seed) => runOf(simple, 'Happiness.max', seed, agents));
    const format = SEEDS.map((seed) => runOf(simpleFormat, 'subject.happiness.max', seed, agents));
    const statistics = {
      'mean happiness': (run: number[]) => run.reduce((a, b) => a + b, 0) / run.length,
      'share at the ceiling': (run: number[]) => run.filter((h) => h === 1000).length / run.length,
      'share broken': (run: number[]) => run.filter((h) => h === 3).length / run.length,
    };
    return Object.entries(statistics).map(([name, of]) => {
      const x = summary(coded.map(of));
      const y = summary(format.map(of));
      return { name, coded: x, format: y, se: Math.sqrt((x.sd ** 2 + y.sd ** 2) / SEEDS.length) };
    });
  };

  it.each([2, 6])(
    'agrees with the coded port in distribution with %i agents',
    (agents) => {
      for (const row of compare(agents)) {
        expect(Math.abs(row.coded.mean - row.format.mean), row.name).toBeLessThan(4 * row.se);
        const ratio = row.format.sd / row.coded.sd;
        expect(ratio, row.name).toBeGreaterThan(1 / 3);
        expect(ratio, row.name).toBeLessThan(3);
      }
    },
    30_000,
  );
});
