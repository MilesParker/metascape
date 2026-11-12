// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import { channels, colors, gradient, mix, rgb, toCss } from './color';

describe('colour helpers', () => {
  it('packs, unpacks and prints colours', () => {
    expect(rgb(255, 128, 0)).toBe(0xff8000);
    expect(rgb(300, -5, 127.6)).toBe(0xff0080);
    expect(channels(0x102030)).toEqual([16, 32, 48]);
    expect(toCss(0x00ff7f)).toBe('#00ff7f');
  });

  it('mixes linearly and clamps', () => {
    expect(mix(colors.black, colors.white, 0.5)).toBe(0x808080);
    expect(mix(colors.black, colors.white, -1)).toBe(colors.black);
    expect(mix(colors.black, colors.white, 2)).toBe(colors.white);
    expect(mix(colors.black, colors.white, Number.NaN)).toBe(colors.black);
  });

  it('builds gradients through several stops', () => {
    const scale = gradient(0x000000, 0xff0000, 0xffffff);
    expect(scale(0)).toBe(0x000000);
    expect(scale(1)).toBe(0xffffff);
    expect(channels(scale(0.5))[0]).toBeGreaterThan(250);
    expect(scale(-3)).toBe(0x000000);
    expect(scale(Number.NaN)).toBe(0x000000);
    expect(() => gradient(0x000000)).toThrow(RangeError);
  });
});
