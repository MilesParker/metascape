// SPDX-License-Identifier: EPL-2.0

const UINT32_RANGE = 0x1_0000_0000;

/** FNV-1a, used only to turn a string seed into 32 bits. */
function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** splitmix32: expands one 32-bit seed into a sequence of well-mixed words. */
function splitmix32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x9e3779b9) | 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

/** The complete internal state of a {@link Random}; restoring it resumes the same stream. */
export type RandomState = readonly [a: number, b: number, c: number, d: number];

/**
 * Seeded pseudo-random number generator (sfc32).
 *
 * Every source of randomness in a model run must come from a `Random`, so that
 * a run is fully determined by its seed. The same seed gives the same stream
 * on every platform, since only 32-bit integer operations are used.
 */
export class Random {
  #a = 0;
  #b = 0;
  #c = 0;
  #d = 1;

  constructor(seed: number | string = 0) {
    const next = splitmix32(typeof seed === 'string' ? hashString(seed) : seed);
    this.#a = next();
    this.#b = next();
    this.#c = next();
    this.#warmUp();
  }

  /** Recreates a generator from a state captured with {@link Random.state}. */
  static fromState(state: RandomState): Random {
    const random = new Random();
    [random.#a, random.#b, random.#c, random.#d] = state.map((word) => word | 0) as [
      number,
      number,
      number,
      number,
    ];
    return random;
  }

  /** A snapshot of the internal state, for checkpointing a run. */
  get state(): RandomState {
    return [this.#a >>> 0, this.#b >>> 0, this.#c >>> 0, this.#d >>> 0];
  }

  /** Uniform integer in [0, 2^32). */
  uint32(): number {
    const t = (((this.#a + this.#b) | 0) + this.#d) | 0;
    this.#d = (this.#d + 1) | 0;
    this.#a = this.#b ^ (this.#b >>> 9);
    this.#b = (this.#c + (this.#c << 3)) | 0;
    this.#c = (this.#c << 21) | (this.#c >>> 11);
    this.#c = (this.#c + t) | 0;
    return t >>> 0;
  }

  /** Uniform float in [0, 1). */
  float(): number {
    return this.uint32() / UINT32_RANGE;
  }

  /** Uniform integer in [min, max), without modulo bias. */
  int(min: number, max: number): number {
    const span = max - min;
    if (!Number.isInteger(min) || !Number.isInteger(max) || span <= 0 || span > UINT32_RANGE) {
      throw new RangeError(`int(${min}, ${max}): need integers with 0 < max - min <= 2^32`);
    }
    const limit = UINT32_RANGE - (UINT32_RANGE % span);
    let value = this.uint32();
    while (value >= limit) value = this.uint32();
    return min + (value % span);
  }

  /** True with the given probability. */
  chance(probability = 0.5): boolean {
    return this.float() < probability;
  }

  /** A uniformly chosen element. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('pick: empty array');
    return items[this.int(0, items.length)] as T;
  }

  /** Shuffles in place (Fisher–Yates) and returns the same array. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(0, i + 1);
      const held = items[i] as T;
      items[i] = items[j] as T;
      items[j] = held;
    }
    return items;
  }

  /**
   * Derives an independent child generator, advancing this one.
   * Use one fork per subsystem so that adding draws in one place
   * does not shift the stream seen by another.
   */
  fork(): Random {
    const child = new Random();
    child.#a = this.uint32() | 0;
    child.#b = this.uint32() | 0;
    child.#c = this.uint32() | 0;
    child.#d = 1;
    child.#warmUp();
    return child;
  }

  #warmUp(): void {
    for (let i = 0; i < 15; i++) this.uint32();
  }
}
