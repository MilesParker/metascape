// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import { decimate, decimateIndices } from './decimate';

const wave = (n: number): Float64Array =>
  Float64Array.from({ length: n }, (_, i) => Math.sin(i / 37) * 10 + (i % 997 === 0 ? 50 : 0));

describe('decimate', () => {
  it('returns short input unchanged', () => {
    const x = Float64Array.from([0, 1, 2, 3]);
    const y = Float64Array.from([5, 6, 7, 8]);
    const out = decimate(x, [y], 10);
    expect([...out.x]).toEqual([0, 1, 2, 3]);
    expect([...out.ys[0]!]).toEqual([5, 6, 7, 8]);
  });

  it('limits length and keeps first and last samples', () => {
    const n = 100_000;
    const x = Float64Array.from({ length: n }, (_, i) => i);
    const out = decimate(x, [wave(n)], 2000);
    expect(out.x.length).toBeLessThanOrEqual(2002);
    expect(out.x.length).toBeGreaterThan(1000);
    expect(out.x[0]).toBe(0);
    expect(out.x[out.x.length - 1]).toBe(n - 1);
    expect(out.ys[0]!.length).toBe(out.x.length);
    for (let i = 1; i < out.x.length; i++) expect(out.x[i]!).toBeGreaterThan(out.x[i - 1]!);
  });

  it('preserves the minimum and maximum of every series', () => {
    const n = 50_000;
    const a = wave(n);
    const b = Float64Array.from(a, (v, i) => (i === 31_337 ? -500 : -v));
    const x = Float64Array.from({ length: n }, (_, i) => i);
    const out = decimate(x, [a, b], 2000);
    expect(out.x.length).toBeLessThanOrEqual(2002);
    expect(Math.max(...out.ys[0]!)).toBe(Math.max(...a));
    expect(Math.min(...out.ys[0]!)).toBe(Math.min(...a));
    expect(Math.min(...out.ys[1]!)).toBe(-500);
    expect(Math.max(...out.ys[1]!)).toBe(Math.max(...b));
  });

  it('ignores NaN when choosing extremes', () => {
    const y = new Float64Array(10_000).fill(Number.NaN);
    y[1234] = 7;
    const indices = decimateIndices([y], y.length, 100);
    expect(indices).toContain(1234);
    expect(indices.length).toBeLessThanOrEqual(102);
  });
});
