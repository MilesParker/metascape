// SPDX-License-Identifier: EPL-2.0

/** An opaque colour as a 24-bit integer, `0xRRGGBB`. */
export type Color = number;

const channel = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

/** A colour from red, green and blue channels in 0..255 (clamped and rounded). */
export function rgb(red: number, green: number, blue: number): Color {
  return (channel(red) << 16) | (channel(green) << 8) | channel(blue);
}

/** The red, green and blue channels of a colour, each 0..255. */
export function channels(color: Color): [red: number, green: number, blue: number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

/** A colour as CSS text, such as `#1f77b4`. */
export function toCss(color: Color): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** Blends from `from` (t = 0) to `to` (t = 1); `t` is clamped to 0..1. */
export function mix(from: Color, to: Color, t: number): Color {
  const k = Number.isNaN(t) ? 0 : Math.max(0, Math.min(1, t));
  const [r1, g1, b1] = channels(from);
  const [r2, g2, b2] = channels(to);
  return rgb(r1 + (r2 - r1) * k, g1 + (g2 - g1) * k, b1 + (b2 - b1) * k);
}

/**
 * A colour scale through evenly spaced stops: the result maps 0 to the first
 * stop and 1 to the last, clamping outside that range. Colours are
 * precomputed, so the scale is cheap to call once per agent per frame.
 */
export function gradient(...stops: Color[]): (t: number) => Color {
  if (stops.length < 2) throw new RangeError('gradient needs at least two colours');
  const steps = 256;
  const table = new Uint32Array(steps);
  for (let i = 0; i < steps; i++) {
    const position = (i / (steps - 1)) * (stops.length - 1);
    const index = Math.min(Math.floor(position), stops.length - 2);
    table[i] = mix(stops[index]!, stops[index + 1]!, position - index);
  }
  return (t) => {
    const k = Number.isNaN(t) ? 0 : Math.max(0, Math.min(1, t));
    return table[Math.round(k * (steps - 1))]!;
  };
}

/** A small set of named colours that read well on light and dark backgrounds. */
export const colors = {
  black: 0x000000,
  white: 0xffffff,
  gray: 0x8a8f98,
  red: 0xd9483b,
  orange: 0xe8833a,
  yellow: 0xe3b341,
  green: 0x3fa45b,
  teal: 0x2a9d8f,
  blue: 0x3b7dd8,
  purple: 0x8a63d2,
  pink: 0xd4619c,
  brown: 0x8d6e53,
} as const satisfies Record<string, Color>;
