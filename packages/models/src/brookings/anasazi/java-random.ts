// SPDX-License-Identifier: EPL-2.0

/**
 * Small random and numeric helpers with the semantics the legacy Java code
 * relied on (Ascape's `randomInRange`, `java.util.Random.nextGaussian`, the
 * Java `(int)` cast), built on the engine's seeded {@link Random}. They do not
 * reproduce Java's random sequence, only its distributions and edge cases.
 */
import type { Random } from '@metascape/engine';

const spareGaussian = new WeakMap<Random, number>();

/**
 * A standard normal deviate by the Marsaglia polar method, as
 * `java.util.Random.nextGaussian` computes it: each pair of uniform draws
 * yields two deviates, and the second is kept for the next call on the same
 * stream.
 */
export function gaussian(random: Random): number {
  const spare = spareGaussian.get(random);
  if (spare !== undefined) {
    spareGaussian.delete(random);
    return spare;
  }
  let v1: number;
  let v2: number;
  let s: number;
  do {
    v1 = 2 * random.float() - 1;
    v2 = 2 * random.float() - 1;
    s = v1 * v1 + v2 * v2;
  } while (s >= 1 || s === 0);
  const multiplier = Math.sqrt((-2 * Math.log(s)) / s);
  spareGaussian.set(random, v2 * multiplier);
  return v1 * multiplier;
}

/** A uniform integer in `[low, high]`, both inclusive (Ascape `randomInRange(int, int)`). */
export function intInclusive(random: Random, low: number, high: number): number {
  return random.int(low, high + 1);
}

/** `low + u * (high - low)` for uniform `u` in [0, 1) (Ascape `randomInRange(double, double)`). */
export function realInRange(random: Random, low: number, high: number): number {
  return random.float() * (high - low) + low;
}

/**
 * Java's narrowing cast from double to int: truncation toward zero, NaN to 0,
 * and saturation at the int range.
 */
export function javaInt(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value >= 2147483647) return 2147483647;
  if (value <= -2147483648) return -2147483648;
  return Math.trunc(value);
}
