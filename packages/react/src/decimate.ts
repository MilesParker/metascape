// SPDX-License-Identifier: EPL-2.0

/** Default number of points kept per series when plotting. */
export const MAX_POINTS = 2000;

/**
 * Chooses which sample indices to keep so that every series keeps its
 * minima and maxima. The samples are split into equal buckets; from each
 * bucket the index of every series' lowest and highest value is kept (NaN is
 * ignored), plus the first and last sample. At most `maxPoints + 2` indices are
 * returned, in ascending order, so with many series the buckets get coarser.
 * Input that already fits is returned as every index.
 */
export function decimateIndices(
  series: readonly ArrayLike<number>[],
  length: number,
  maxPoints = MAX_POINTS,
): number[] {
  if (length <= maxPoints || length <= 2) {
    return Array.from({ length }, (_, i) => i);
  }
  const buckets = Math.max(1, Math.floor(maxPoints / (2 * Math.max(1, series.length))));
  const size = length / buckets;
  const keep = new Set<number>([0, length - 1]);
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * size);
    const to = Math.min(length, Math.floor((b + 1) * size));
    for (const values of series) {
      let lowIndex = -1;
      let highIndex = -1;
      let low = Infinity;
      let high = -Infinity;
      for (let i = from; i < to; i++) {
        const v = values[i]!;
        if (Number.isNaN(v)) continue;
        if (v < low) {
          low = v;
          lowIndex = i;
        }
        if (v > high) {
          high = v;
          highIndex = i;
        }
      }
      if (lowIndex >= 0) keep.add(lowIndex);
      if (highIndex >= 0) keep.add(highIndex);
    }
  }
  return [...keep].sort((a, b) => a - b);
}

/** Decimated data: one shared x array and one y array per series, all the same length. */
export interface DecimatedData {
  readonly x: Float64Array;
  readonly ys: Float64Array[];
}

/**
 * Reduces a long run to about `maxPoints` points per series with a min/max
 * method (see {@link decimateIndices}), so spikes survive. The inputs are not
 * modified or retained, so views onto growing buffers are safe to pass.
 */
export function decimate(
  x: ArrayLike<number>,
  series: readonly ArrayLike<number>[],
  maxPoints = MAX_POINTS,
): DecimatedData {
  const indices = decimateIndices(series, x.length, maxPoints);
  const outX = new Float64Array(indices.length);
  const ys = series.map(() => new Float64Array(indices.length));
  indices.forEach((source, target) => {
    outX[target] = x[source]!;
    series.forEach((values, s) => {
      ys[s]![target] = values[source]!;
    });
  });
  return { x: outX, ys };
}
