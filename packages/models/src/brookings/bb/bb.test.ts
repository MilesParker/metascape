// SPDX-License-Identifier: EPL-2.0
import { Random, RootScape, Scape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { Beaver } from './beaver';
import { busyBeavers, family } from './index';
import { RuleGa, staticRule } from './rule-search';

const beaversOf = (root: RootScape) => [...(root.findScape('Beavers') as Scape<Beaver>).members];

describe('bb family', () => {
  it('has one model', () => {
    expect(family.models).toHaveLength(1);
  });

  it('runs 20 periods and is deterministic', () => {
    const csv = (seed: number) => {
      const root = new RootScape(busyBeavers, { seed, parameters: { subStepsPerStep: 20 } });
      expect(root.run(20)).toBe(20);
      return root.data.toCSV();
    };
    expect(csv(1)).toBe(csv(1));
    expect(csv(1)).not.toBe(csv(2));
  });

  it('assigns types by number and defaults to 16 beavers', () => {
    const root = new RootScape(busyBeavers, { seed: 1 });
    const types = beaversOf(root)
      .map((b) => b.type)
      .join('');
    expect(types).toBe('sgrmgrmgrmgrmgrm');
  });

  it('only refers to recorded series', () => {
    const root = new RootScape(busyBeavers, { seed: 1, parameters: { subStepsPerStep: 5 } });
    for (const view of root.allViews) {
      if (view.type === 'timeSeries') for (const id of view.series) root.data.get(id);
    }
  });

  it('never lowers best result and keeps ones nonnegative', () => {
    const root = new RootScape(busyBeavers, { seed: 5, parameters: { subStepsPerStep: 30 } });
    let last = beaversOf(root).map((b) => b.maxOnes);
    for (let t = 0; t < 15; t++) {
      root.iterate();
      const now = beaversOf(root).map((b) => b.maxOnes);
      now.forEach((v, i) => {
        expect(v).toBeGreaterThanOrEqual(last[i]!);
        expect(v).toBeGreaterThanOrEqual(0);
      });
      last = now;
    }
  });

  it('gives the static beaver the same result whatever the seed', () => {
    const best = (seed: number) => {
      const root = new RootScape(busyBeavers, { seed, parameters: { subStepsPerStep: 3 } });
      root.run(3);
      return beaversOf(root)[0]!.maxOnes;
    };
    expect(best(1)).toBe(best(2));
    expect(best(1)).toBeGreaterThan(0);
  });

  it('has static rules of the right lengths', () => {
    expect(staticRule(2)).toHaveLength(16);
    expect(staticRule(3)).toHaveLength(24);
    expect(staticRule(4)).toHaveLength(40);
    expect(staticRule(5)).toBe('error');
  });

  it('evolves bit strings toward higher fitness', () => {
    const ga = new RuleGa(40, 24, 7);
    const meanOnes: number[] = [];
    for (let generation = 0; generation < 40; generation++) {
      let total = 0;
      for (let i = 0; i < 40; i++) {
        ga.step();
        const ones = [...ga.currentRuleString].filter((c) => c === '1').length;
        ga.setReward(ones);
        total += ones;
      }
      meanOnes.push(total / 40);
    }
    expect(ga.evolutions).toBe(39);
    expect(meanOnes[39]!).toBeGreaterThan(meanOnes[0]! + 2);
    expect(new Random(1).float()).toBeLessThan(1);
  });
});
