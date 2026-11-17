// SPDX-License-Identifier: EPL-2.0
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { compileModel } from './interpreter';
import { InterpAgent } from './runtime';
import { parseModel } from './schema';

// The Escape examples of AMP, as the translation (../metaabm) writes them.
const folder = new URL('../../examples/escape/', import.meta.url);
const examples = readdirSync(folder)
  .filter((name) => name.endsWith('.model.json'))
  .map((name) => name.slice(0, -'.model.json'.length))
  .sort();

const load = (name: string) =>
  parseModel(JSON.parse(readFileSync(new URL(`${name}.model.json`, folder), 'utf8')));

describe('the Escape examples, interpreted', () => {
  describe.each(examples)('%s', (name) => {
    it('runs, the same from the same seed', () => {
      const model = compileModel(load(name));
      const run = (seed: number) => {
        const root = new RootScape(model, { seed });
        root.run(20);
        return { root, data: root.data.toCSV() };
      };
      const first = run(11);
      expect(first.root.stopReason).toBeUndefined();
      expect(run(11).data).toEqual(first.data);
    });
  });
});

/** The values of an attribute of every agent of a type across the model. */
const tally = (root: RootScape, agent: string, attribute: string) => {
  const values: (boolean | number | string)[] = [];
  for (const scape of root.scapes) {
    for (const member of scape.members) {
      if (!(member instanceof InterpAgent) || member.scape !== scape) continue;
      if (member.info.id !== agent) continue;
      values.push(member.context.state.read(member, member.info.attribute.get(attribute)!));
    }
  }
  return values;
};
const count = (values: readonly unknown[], value: unknown) =>
  values.filter((found) => found === value).length;
const sum = (values: readonly unknown[]) =>
  values.reduce<number>((total, value) => total + (value as number), 0);

describe('what the Escape examples do', () => {
  it('Epidemic spreads', () => {
    const root = new RootScape(compileModel(load('Epidemic')), { seed: 3 });
    const start = count(tally(root, 'individual', 'status'), 'susceptible');
    root.run(120);
    expect(count(tally(root, 'individual', 'status'), 'susceptible')).toBeLessThan(start - 100);
  });

  it('EpidemicRegional starts in one city and spreads', () => {
    const root = new RootScape(compileModel(load('EpidemicRegional')), { seed: 3 });
    expect(count(tally(root, 'individual', 'status'), 'exposed')).toBeGreaterThan(0);
    root.run(120);
    expect(count(tally(root, 'individual', 'status'), 'susceptible')).toBeLessThan(1150);
  });

  it('StupidModel 2 grows its bugs by one each period', () => {
    const root = new RootScape(compileModel(load('StupidModel2')), { seed: 3 });
    root.run(10);
    expect(tally(root, 'bug', 'size')).toEqual(Array.from({ length: 100 }, () => 10));
  });

  it("Demographic Prisoner's Dilemma children take their parent's strategy, so players thrive", () => {
    // Some seeds die out early, as in the code port that came before.
    const root = new RootScape(compileModel(load('DemographicPrisoner_sDilemma')), { seed: 1 });
    root.run(60);
    const strategies = tally(root, 'player', 'cooperate');
    expect(strategies.length).toBeGreaterThan(200);
    expect(count(strategies, true)).toBeGreaterThan(strategies.length / 2);
  });

  it('Heatbugs grow less unhappy', () => {
    const root = new RootScape(compileModel(load('Heatbugs')), { seed: 3 });
    const start = sum(tally(root, 'heatBug', 'unhappiness'));
    root.run(60);
    expect(sum(tally(root, 'heatBug', 'unhappiness'))).toBeLessThan(start * 0.7);
  });

  it('Markets trades: money moves between traders and is kept', () => {
    const root = new RootScape(compileModel(load('Markets')), { seed: 3 });
    const start = tally(root, 'trader', 'funds');
    root.run(5);
    const after = tally(root, 'trader', 'funds');
    expect(after).not.toEqual(start);
    expect(sum(after)).toBeCloseTo(sum(start));
  });
});

describe('a method body (R21)', () => {
  it("runs StupidModel5's ConsumeFood, ported from Java beside the example", () => {
    const root = new RootScape(compileModel(load('StupidModel5')), { seed: 3 });
    root.run(5);
    const sizes = tally(root, 'bug', 'size') as number[];
    expect(sizes).toHaveLength(100);
    expect(sizes.every((size) => size > 0 && size <= 5 * 0.2 + 1e-9)).toBe(true);
    // Each eats what its cell has, up to 0.2, so the bugs differ.
    expect(new Set(sizes).size).toBeGreaterThan(1);
  });
});
