// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import { Random } from './random';

const draw = (random: Random, count: number) =>
  Array.from({ length: count }, () => random.uint32());

describe('Random', () => {
  it('gives the same stream for the same seed', () => {
    expect(draw(new Random(42), 100)).toEqual(draw(new Random(42), 100));
    expect(draw(new Random('sugarscape'), 100)).toEqual(draw(new Random('sugarscape'), 100));
  });

  it('gives different streams for different seeds', () => {
    expect(draw(new Random(1), 8)).not.toEqual(draw(new Random(2), 8));
    expect(draw(new Random('a'), 8)).not.toEqual(draw(new Random('b'), 8));
  });

  it('keeps a fixed stream across releases', () => {
    // Guards reproducibility of published runs: changing these values is a breaking change.
    expect(draw(new Random(0), 4)).toMatchInlineSnapshot(`
      [
        1338548054,
        2499804003,
        2743868851,
        1211391675,
      ]
    `);
  });

  it('resumes from a captured state', () => {
    const random = new Random(7);
    draw(random, 10);
    const resumed = Random.fromState(random.state);
    expect(draw(resumed, 50)).toEqual(draw(random, 50));
  });

  it('produces floats in [0, 1) with a plausible mean', () => {
    const random = new Random(3);
    let sum = 0;
    for (let i = 0; i < 20_000; i++) {
      const value = random.float();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      sum += value;
    }
    expect(sum / 20_000).toBeCloseTo(0.5, 1);
  });

  it('produces integers covering exactly [min, max)', () => {
    const random = new Random(5);
    const seen = new Set<number>();
    for (let i = 0; i < 2_000; i++) seen.add(random.int(-2, 4));
    expect([...seen].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2, 3]);
  });

  it('rejects invalid integer ranges', () => {
    const random = new Random();
    expect(() => random.int(3, 3)).toThrow(RangeError);
    expect(() => random.int(0, 1.5)).toThrow(RangeError);
  });

  it('shuffles to a permutation, deterministically', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const first = new Random(9).shuffle([...items]);
    expect(first).not.toEqual(items);
    expect([...first].sort((a, b) => a - b)).toEqual(items);
    expect(new Random(9).shuffle([...items])).toEqual(first);
  });

  it('picks only existing elements and rejects an empty array', () => {
    const random = new Random(11);
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 100; i++) expect(items).toContain(random.pick(items));
    expect(() => random.pick([])).toThrow(RangeError);
  });

  it('forks children that differ from the parent and from each other', () => {
    const parent = new Random(13);
    const first = draw(parent.fork(), 8);
    const second = draw(parent.fork(), 8);
    expect(first).not.toEqual(second);
    expect(first).not.toEqual(draw(new Random(13), 8));

    const again = new Random(13);
    expect(draw(again.fork(), 8)).toEqual(first);
  });
});
