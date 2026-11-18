// SPDX-License-Identifier: EPL-2.0
import { type Model, RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { cvModelI, cvModelIFormat } from './index';

const FORMAT_SMALL = { 'lattice.width': 20, 'lattice.height': 20 };
const CODED_SMALL = { width: 20, height: 20 };

const makeFormat = (seed: number, parameters: Record<string, number | boolean> = {}) =>
  new RootScape(cvModelIFormat as Model, {
    seed,
    parameters: { ...FORMAT_SMALL, ...parameters } as never,
  });

const runNamed = (name: string) => cvModelIFormat.runs!.find((run) => run.name === name)!;

describe('Civil Violence Model I, written in the model format', () => {
  it('offers Runs 1 to 5 of the paper as run specs of the one model', () => {
    expect(cvModelIFormat.runs!.map((run) => run.name)).toEqual([
      'Run 1',
      'Run 2',
      'Runs 3-5 (base)',
      'Run 3',
      'Run 4',
      'Run 5',
    ]);
  });

  it('runs, charts only recorded series, and is deterministic per seed', () => {
    const csv = (seed: number) => {
      const root = makeFormat(seed);
      root.run(20);
      for (const view of root.allViews) {
        if (view.type === 'timeSeries') {
          for (const id of view.series) expect(() => root.data.get(id)).not.toThrow();
        }
      }
      return root.data.toCSV();
    };
    expect(csv(3)).toBe(csv(3));
    expect(csv(3)).not.toBe(csv(4));
  });

  it('keeps every citizen in exactly one state, and jails citizens off the lattice', () => {
    const root = makeFormat(2);
    for (let t = 0; t < 30; t++) {
      root.run(1);
      const { data } = root;
      expect(
        data.latest('citizen.state.active') +
          data.latest('citizen.state.quiescent') +
          data.latest('citizen.state.jailed'),
      ).toBe(data.latest('citizen.count'));
    }
    expect(root.data.latest('citizen.state.jailed')).toBeGreaterThan(0);
  });

  it('Run 1 is calm: citizens stay put and few rebel', () => {
    const run = runNamed('Run 1');
    const root = makeFormat(1, run.parameters as never);
    root.run(30);
    expect(root.data.latest('citizen.state.active')).toBeLessThan(20);
  });

  // Grievance is hardship times (1 - legitimacy) times (1 - threshold), and hardship is fixed, so
  // the mean grievance over all citizens follows legitimacy exactly.
  const legitimacyAt = (root: RootScape, base: number) => {
    const grievance = Array.from(root.data.values('citizen.grievance.mean'));
    return grievance.map((g) => 1 - ((1 - base) * g) / grievance[0]!);
  };

  it('Run 3 lets legitimacy fall by 0.01 every third period', () => {
    const root = makeFormat(1, runNamed('Run 3').parameters as never);
    root.run(31);
    const legitimacy = legitimacyAt(root, 0.9);
    expect(legitimacy[1]).toBeCloseTo(0.9, 9);
    expect(legitimacy[30]).toBeCloseTo(0.9 - 0.01 * 10, 9);
    const falls = legitimacy.filter((l, i) => i > 0 && l < legitimacy[i - 1]! - 1e-9).length;
    expect(falls).toBe(10);
  });

  it('Run 4 cuts legitimacy to 0.65 at period 75', () => {
    const root = makeFormat(1, runNamed('Run 4').parameters as never);
    root.run(90);
    const legitimacy = legitimacyAt(root, 0.9);
    expect(legitimacy[70]).toBeCloseTo(0.9, 9);
    expect(legitimacy[85]).toBeCloseTo(0.65, 9);
  }, 30_000);

  it('Run 5 withdraws the cops as their density falls to nothing', () => {
    const root = makeFormat(1, runNamed('Run 5').parameters as never);
    root.run(30);
    const half = root.data.latest('cop.count');
    expect(half).toBeLessThan(0.06 * 400);
    expect(half).toBeGreaterThan(0);
    root.run(40);
    expect(root.data.latest('cop.count')).toBe(0);
  }, 30_000);
});

/**
 * Statistical equivalence with the coded port. Both run the same default model
 * (40 x 40 is too slow for a unit test, so 20 x 20 at the same densities) over
 * the same seeds. A run's figure is the mean of a statistic over the periods
 * after it has settled; the two versions' means over seeds must differ by less
 * than four standard errors of the difference (the sampling noise of 12 seeds
 * each), and by less than two per cent of the population in any case, and
 * their spreads between seeds must be of the same size.
 */
describe('Civil Violence Model I: the format model against the coded port', () => {
  const SEEDS = 12;
  const PERIODS = 80;
  const SETTLED = 30;
  const POPULATION = 280;

  const names = {
    coded: { active: 'Active', jailed: 'Jailed', quiescent: 'Quiescent' },
    format: {
      active: 'citizen.state.active',
      jailed: 'citizen.state.jailed',
      quiescent: 'citizen.state.quiescent',
    },
  } as const;

  function sample(model: Model, kind: 'coded' | 'format', parameters: object) {
    const figures: Record<'active' | 'jailed' | 'quiescent', number[]> = {
      active: [],
      jailed: [],
      quiescent: [],
    };
    for (let seed = 1; seed <= SEEDS; seed++) {
      const root = new RootScape(model, { seed, parameters: parameters as never });
      root.run(PERIODS);
      for (const key of ['active', 'jailed', 'quiescent'] as const) {
        const values = Array.from(root.data.values(names[kind][key])).slice(SETTLED);
        figures[key].push(values.reduce((a, b) => a + b, 0) / values.length);
      }
    }
    return figures;
  }

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = (xs: number[]) => {
    const m = mean(xs);
    return xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
  };

  it('settles to the same active, jailed and quiescent numbers, with the same spread', () => {
    const coded = sample(cvModelI as Model, 'coded', CODED_SMALL);
    const format = sample(cvModelIFormat as Model, 'format', FORMAT_SMALL);
    for (const key of ['active', 'jailed', 'quiescent'] as const) {
      const difference = Math.abs(mean(coded[key]) - mean(format[key]));
      const standardError = Math.sqrt(variance(coded[key]) / SEEDS + variance(format[key]) / SEEDS);
      expect(difference, `${key}: ${mean(coded[key])} against ${mean(format[key])}`).toBeLessThan(
        Math.max(4 * standardError, 0.02 * POPULATION),
      );
      const spread = Math.sqrt(variance(format[key]) / variance(coded[key]));
      expect(spread, `${key} spread ratio`).toBeGreaterThan(0.4);
      expect(spread, `${key} spread ratio`).toBeLessThan(2.5);
    }
  }, 30_000);
});
