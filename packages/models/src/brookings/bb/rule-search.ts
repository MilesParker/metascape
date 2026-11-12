// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.bb.Bga, Brr and Bsr.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { Random } from '@metascape/engine';

/**
 * A genetic algorithm over a population of bit-string rules (legacy `Bga`).
 *
 * Rules are handed out one at a time with {@link step}; the caller reports a
 * fitness for each with {@link setReward}; after the last rule of the
 * population a new generation is bred. Defaults as in the legacy class:
 * turnover 0.5, crossover 0.5, mutation 0.001, fitness normalized.
 */
export class RuleGa {
  readonly rules: string[];
  readonly fitness: number[];
  /** Number of generations bred so far. */
  evolutions = 0;
  crossovers = 0;
  mutations = 0;
  currentRule = -1;
  sumFitness = 0;
  meanFitness = 0;
  maxFitness = 0;
  minFitness = 0;
  bestRule = 0;
  worstRule = 0;
  normalizeFitness = true;
  turnoverRate = 0.5;
  crossoverRate = 0.5;
  mutationRate = 0.001;

  readonly #willReproduce: boolean[];
  readonly #willDie: boolean[];
  readonly #newRules: string[];
  readonly #random: Random;
  #parents: number;
  #children: number;

  constructor(
    readonly numberOfRules: number,
    readonly ruleLength: number,
    seed: number,
  ) {
    this.#random = new Random(seed);
    this.rules = [];
    this.#newRules = [];
    for (let i = 0; i < numberOfRules; i++) {
      const rule = randomBits(this.#random, ruleLength);
      this.rules.push(rule);
      this.#newRules.push(rule);
    }
    this.fitness = new Array<number>(numberOfRules).fill(0);
    this.#willReproduce = new Array<boolean>(numberOfRules).fill(false);
    this.#willDie = new Array<boolean>(numberOfRules).fill(false);
    this.#parents = numberOfRules;
    this.#children = numberOfRules;
  }

  /** The rule to try now. */
  get currentRuleString(): string {
    return this.rules[this.currentRule] ?? '';
  }

  /** Moves to the next rule, breeding a new generation after the last one. */
  step(): void {
    this.currentRule++;
    if (this.currentRule === this.numberOfRules) {
      this.#evolve();
      this.currentRule = 0;
    }
  }

  /** Records the fitness of the current rule. */
  setReward(value: number): void {
    const i = this.currentRule;
    this.fitness[i] = value;
    if (i === 0) {
      this.sumFitness = this.minFitness = this.maxFitness = value;
      this.worstRule = this.bestRule = i;
      this.meanFitness = value;
    } else {
      this.sumFitness += value;
      this.meanFitness = this.sumFitness / (i + 1);
      if (this.maxFitness < value) {
        this.maxFitness = value;
        this.bestRule = i;
      }
      if (this.minFitness > value) {
        this.minFitness = value;
        this.worstRule = i;
      }
    }
  }

  #evolve(): void {
    this.#prepare();
    this.#selectParents();
    this.#selectSurvivors();
    this.#copy();
    this.#cross();
    this.#replace();
  }

  #prepare(): void {
    const n = this.numberOfRules;
    let w = 0;
    this.evolutions++;
    this.#parents = Math.trunc(n * this.turnoverRate);
    this.#parents -= this.#parents % 2;
    if (this.#parents < 2) this.#parents = 2;
    if (n < 2) this.#parents = 0;
    if (this.normalizeFitness) {
      w = this.maxFitness;
      for (let i = 0; i < n; i++) {
        const f = this.fitness[i]!;
        if (f < w && f > this.minFitness) w = f;
      }
      w = this.minFitness - (w - this.minFitness) / 1000;
    }
    this.sumFitness = 0;
    for (let i = 0; i < n; i++) {
      this.fitness[i] = this.fitness[i]! - w;
      this.sumFitness += this.fitness[i]!;
      this.#willReproduce[i] = false;
      this.#willDie[i] = true;
    }
  }

  /** Roulette-wheel selection over the entries whose flag in `eligible` equals `wanted`. */
  #select(count: number, eligible: boolean[], wanted: boolean, flag: boolean): void {
    let w = this.sumFitness;
    for (let i = 0; i < count; i++) {
      const r = this.#random.float() * w;
      let s = 0;
      let j = 0;
      while (s < r && j < this.numberOfRules) {
        if (eligible[j] === wanted) s += this.fitness[j]!;
        j++;
      }
      if (j < 1) j = 1;
      eligible[j - 1] = flag;
      w -= this.fitness[j - 1]!;
    }
  }

  #selectParents(): void {
    this.#select(this.#parents, this.#willReproduce, false, true);
  }

  #selectSurvivors(): void {
    this.#select(this.numberOfRules - this.#parents, this.#willDie, true, false);
  }

  #copy(): void {
    let j = 0;
    for (let i = 0; i < this.numberOfRules; i++) {
      if (this.#willReproduce[i]) this.#newRules[j++] = this.rules[i]!;
    }
    this.#children = j;
  }

  #cross(): void {
    const len = this.ruleLength;
    for (let i = 0; i < Math.trunc(this.#children / 2); i++) {
      const g0 = this.#newRules[i * 2]!.split('');
      const g1 = this.#newRules[i * 2 + 1]!.split('');
      let xp = 0;
      if (this.#random.float() < this.crossoverRate) {
        xp = Math.trunc(this.#random.float() * (len - 1)) + 1;
        this.crossovers++;
      }
      for (let j = 0; j < len; j++) {
        if (this.#random.float() < this.mutationRate) {
          this.mutations++;
          g0[j] = g0[j] === '0' ? '1' : '0';
        }
        if (this.#random.float() < this.mutationRate) {
          this.mutations++;
          g1[j] = g1[j] === '0' ? '1' : '0';
        }
        if (j < xp) {
          const work = g0[j]!;
          g0[j] = g1[j]!;
          g1[j] = work;
        }
      }
      this.#newRules[i * 2] = g0.join('');
      this.#newRules[i * 2 + 1] = g1.join('');
    }
  }

  #replace(): void {
    let j = 0;
    for (let i = 0; i < this.numberOfRules; i++) {
      if (this.#willDie[i]) this.rules[i] = this.#newRules[j++]!;
    }
  }
}

/** A string of random bits, each one with probability one half (legacy `Brr` and `Bga` start-up). */
export function randomBits(random: Random, length: number): string {
  let bits = '';
  for (let i = 0; i < length; i++) bits += random.float() < 0.5 ? '0' : '1';
  return bits;
}

/** Legacy `Brr`: a source of fresh random rules, one for each call. */
export class RandomRuleSource {
  readonly #random: Random;
  constructor(
    readonly ruleLength: number,
    seed: number,
  ) {
    this.#random = new Random(seed);
  }
  getCurrentRule(): string {
    return randomBits(this.#random, this.ruleLength);
  }
}

const RULE_2 = '1101' + '1001' + '1000' + '1010';
const RULE_3 = '1101' + '1010' + '1000' + '1101' + '1001' + '1111';
const RULE_4 = '11001' + '10001' + '10000' + '00010' + '11100' + '10011' + '11011' + '01000';

/**
 * Legacy `Bsr`: the fixed rule of the static beaver for 2, 3 or 4 states.
 * Each entry is action (1 bit), move (1 bit, 1 is right) and next state, for
 * state/symbol pairs 00, 01, 10, 11, 20, 21, 30, 31. (The legacy comments list
 * these as, for three states: 1R1, 1L2, 1L0, 1R1, 1L1, 1R3.) Any other count gives "error".
 */
export function staticRule(maxStati: number): string {
  if (maxStati === 2) return RULE_2;
  if (maxStati === 3) return RULE_3;
  if (maxStati === 4) return RULE_4;
  return 'error';
}
