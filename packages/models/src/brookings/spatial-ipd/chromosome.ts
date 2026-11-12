// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: name.milesparker.spatialipd.Chromosome.
// Original: Copyright 2000 Miles T. Parker.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles T. Parker and contributors, under EPL-2.0.
import type { Random } from '@metascape/engine';

/**
 * A strategy chromosome: a bit string of 0 (cooperate) and 1 (defect).
 *
 * For memory size m the layout is: 4^m response bits (indexed by the history
 * of the last m rounds), then 2m bits for the default history assumed before
 * a first meeting, then one preference bit (0: prefers its closest neighbor,
 * 1: its furthest).
 */
export class Chromosome {
  readonly encoding: Uint8Array;

  constructor(size: number) {
    this.encoding = new Uint8Array(size);
  }

  /** Draws every bit at random. */
  randomize(random: Random): void {
    for (let i = 0; i < this.encoding.length; i++) this.encoding[i] = random.chance() ? 0 : 1;
  }

  /** A copy of this chromosome. */
  copy(): Chromosome {
    const clone = new Chromosome(this.encoding.length);
    clone.encoding.set(this.encoding);
    return clone;
  }

  /** Flips each bit independently with the given probability. */
  mutate(random: Random, probability: number): void {
    for (let i = 0; i < this.encoding.length; i++) {
      if (random.float() < probability) this.encoding[i] = this.encoding[i] === 1 ? 0 : 1;
    }
  }

  /** The share of bits in which the two chromosomes differ. */
  hammingDistance(other: Chromosome): number {
    let distance = 0;
    for (let i = 0; i < this.encoding.length; i++) {
      if (this.encoding[i] !== other.encoding[i]) distance++;
    }
    return distance / other.encoding.length;
  }

  /** Swaps the first `locus` bits with those of another chromosome. */
  crossover(other: Chromosome, locus: number): void {
    for (let i = 0; i < locus; i++) {
      const held = this.encoding[i]!;
      this.encoding[i] = other.encoding[i]!;
      other.encoding[i] = held;
    }
  }

  /** The first `length` bits as a string of C and D. */
  toString(length = this.encoding.length): string {
    let text = '';
    for (let i = 0; i < length; i++) text += this.encoding[i] === 0 ? 'C' : 'D';
    return text;
  }
}
