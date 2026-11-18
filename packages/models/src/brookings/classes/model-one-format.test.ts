// SPDX-License-Identifier: EPL-2.0
import { RootScape, type Model } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { classesFigure3, classesModelOne } from './models';
import { classesModelOneFormat } from './index';

/** A bargainer of the format version: a nested scape of the interpreter, read by attribute ID. */
interface BargainerScape {
  readonly info: { readonly attributes: readonly { readonly id: string }[] };
  readonly values: readonly unknown[];
  readonly populations: ReadonlyMap<string, { readonly members: readonly { values: unknown[] }[] }>;
}

const bargainers = (root: RootScape) =>
  [...root.findScape('Bargainers')!.members] as unknown as BargainerScape[];
const read = (b: BargainerScape, id: string) =>
  b.values[b.info.attributes.findIndex((a) => a.id === id)];
/** The shares a bargainer remembers, one per memory agent. */
const memories = (b: BargainerScape) =>
  b.populations.get('memory')!.members.map((m) => m.values[0] as number);

const run = (name: string) => classesModelOneFormat.runs!.find((r) => r.name === name)!;
const make = (seed: number, parameters: object = {}) =>
  new RootScape(classesModelOneFormat as never, { seed, parameters: parameters as never });

describe('Emergence of Classes: Model One (format)', () => {
  it('keeps each memory at its drawn size, holding demanded shares', () => {
    const root = make(1, { population: 60 });
    root.run(40);
    for (const b of bargainers(root)) {
      const size = read(b, 'memorySize') as number;
      expect(size).toBeGreaterThanOrEqual(20);
      expect(size).toBeLessThanOrEqual(100);
      const shares = memories(b);
      expect(shares).toHaveLength(size);
      for (const s of shares) expect([0.3, 0.5, 0.7]).toContain(s);
    }
    const last = ['low', 'medium', 'high'].reduce(
      (sum, level) => sum + root.data.latest(`bargainer.demand.${level}`),
      0,
    );
    expect(last).toBe(60);
  });

  it('is deterministic by seed', () => {
    const csv = (seed: number) => {
      const root = make(seed, { population: 40 });
      root.run(20);
      return root.data.toCSV();
    };
    expect(csv(5)).toBe(csv(5));
    expect(csv(5)).not.toBe(csv(6));
  });

  it('charts the demands it records', () => {
    const root = make(1);
    const known = new Set(root.data.series.map((s) => s.id));
    const charts = root.allViews.filter((v) => v.type === 'timeSeries');
    expect(charts).toHaveLength(1);
    for (const v of charts) for (const id of v.series) expect(known.has(id)).toBe(true);
  });

  it('runs figures 2 and 3 as settings of Model One', () => {
    expect(classesModelOneFormat.runs?.map((r) => r.name)).toEqual(['Figure 2', 'Figure 3']);
    const f2 = make(1, { population: 30, ...run('Figure 2').parameters });
    expect(bargainers(f2).every((b) => memories(b).length === 20)).toBe(true);
    expect(bargainers(f2).some((b) => memories(b).includes(0.5))).toBe(true);
    const f3 = make(1, { population: 30, ...run('Figure 3').parameters });
    for (const b of bargainers(f3)) expect(memories(b)).not.toContain(0.5);
  });

  /*
   * Statistical equivalence with the coded port (the format version draws its
   * random numbers in other places and orders, so only distributions can
   * agree). For each of 12 seeds, both versions run 60 periods at the
   * defaults, and the share of agents making each demand is averaged over
   * periods 31 to 60, after both have settled (they settle within about 25
   * periods). Across seeds, the means of the two versions must differ by less
   * than four standard errors of their difference (a two-sample z bound,
   * which a true difference of zero exceeds with probability below 1 in
   * 10,000), and their spreads by less than a factor of three (looser than an
   * F test's 1% bound for 11 and 11 degrees of freedom, a ratio of about 2.1
   * in standard deviation, since spreads from 12 seeds are rough). The same
   * is done for figure 3, whose low and high start keeps both versions in the
   * fractious state, with roughly as many low as high demands.
   */
  const LEVELS = ['low', 'medium', 'high'] as const;
  const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
  const PERIODS = 60;
  const SETTLED = 30;

  /** Per seed, the average share of each demand over the settled periods. */
  const settledShares = (
    model: Model,
    series: (level: (typeof LEVELS)[number]) => string,
    parameters: object,
  ) =>
    SEEDS.map((seed) => {
      const root = new RootScape(model as never, { seed, parameters: parameters as never });
      const population = root.parameters.population as number;
      const sums = [0, 0, 0];
      for (let period = 1; period <= PERIODS; period++) {
        root.run(1);
        if (period <= SETTLED) continue;
        LEVELS.forEach((level, i) => (sums[i]! += root.data.latest(series(level)) / population));
      }
      return sums.map((sum) => sum / (PERIODS - SETTLED));
    });

  const summary = (samples: readonly number[]) => {
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / (samples.length - 1);
    return { mean, sd: Math.sqrt(variance) };
  };

  const compare = (coded: Model, codedParameters: object, dataParameters: object) => {
    const a = settledShares(coded, (level) => level, codedParameters);
    const b = settledShares(
      classesModelOneFormat,
      (level) => `bargainer.demand.${level}`,
      dataParameters,
    );
    return LEVELS.map((level, i) => {
      const x = summary(a.map((s) => s[i]!));
      const y = summary(b.map((s) => s[i]!));
      const se = Math.sqrt((x.sd ** 2 + y.sd ** 2) / SEEDS.length);
      return { level, coded: x, data: y, se };
    });
  };

  const expectEquivalent = (rows: ReturnType<typeof compare>) => {
    for (const row of rows) {
      expect(Math.abs(row.coded.mean - row.data.mean), row.level).toBeLessThan(4 * row.se);
      const ratio = row.data.sd / row.coded.sd;
      expect(ratio, row.level).toBeGreaterThan(1 / 3);
      expect(ratio, row.level).toBeLessThan(3);
    }
  };

  it('agrees with the coded port in distribution at the defaults', () => {
    const rows = compare(classesModelOne, {}, {});
    // The equitable norm: about 0.93 medium, the rest the random demands.
    expect(rows[1]!.data.mean).toBeGreaterThan(0.85);
    expectEquivalent(rows);
  }, 30_000);

  it('agrees with the coded port in distribution for figure 3', () => {
    const rows = compare(classesFigure3, {}, run('Figure 3').parameters!);
    // Fractious: mostly low and high demands.
    expect(rows[1]!.data.mean).toBeLessThan(0.15);
    expectEquivalent(rows);
  }, 30_000);
});
