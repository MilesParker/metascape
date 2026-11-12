// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.bb.Beaver.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { Agent, Random } from '@metascape/engine';
import { RandomRuleSource, RuleGa, staticRule } from './rule-search';

/** The settings the legacy `Beaver` constructor received, as static fields. */
export interface BeaverConfig {
  /** Length of the Turing machine tape. Legacy 512. */
  readonly tapeLength: number;
  /** Number of machine states (`maxStati`). Legacy 3. */
  readonly maxStati: number;
  /** A run longer than this many transitions counts as not halting. Legacy 50. */
  readonly maxTrans: number;
  /** Substeps (trial machines) per step. Legacy 100. */
  readonly subStepPerStep: number;
}

/**
 * Beaver types: `s` static rule, `r` random rules, `g` one genetic algorithm
 * over whole rule tables, `m` one genetic algorithm per machine state.
 */
export type BeaverType = 's' | 'r' | 'g' | 'm';

/**
 * A searcher for busy-beaver Turing machines (legacy `Beaver`). Each substep it
 * is given a rule table for a small machine with two symbols (0 and 1), runs it
 * on a blank tape for at most `maxTrans` transitions and counts the 1s left on
 * the tape if the machine halts; halting means moving to a state numbered
 * `maxStati` or more. The best count so far is `maxOnes`.
 */
export class Beaver extends Agent {
  type: BeaverType = 'm';
  maxOnes = 0;
  writtenOnes = 0;
  averageOnes = 0;
  steps = 0;

  readonly #config: BeaverConfig;
  readonly #mode: number;
  readonly #number: number;
  readonly #tape: Uint8Array;
  readonly #action: Uint8Array;
  /** 1 for a move right, 0 for left. */
  readonly #moveRight: Uint8Array;
  readonly #newStatus: Int32Array;
  readonly #subRuleOnes: Int32Array;
  readonly #subRuleUsed: Uint8Array;
  readonly #statusUsed: Uint8Array;
  #status = 0;
  #trans = 0;
  #head = 0;
  #firstTime = true;
  #bsrLength = 0;
  #brr: RandomRuleSource | undefined;
  #bga: RuleGa | undefined;
  #mga: RuleGa[] = [];

  /** `number` is the beaver's index in creation order (legacy static `counter`). */
  constructor(config: BeaverConfig, number: number) {
    super();
    this.#config = config;
    this.#number = number;
    this.#mode = config.maxStati < 4 ? 2 : 3;
    const n = config.maxStati * 2;
    this.#tape = new Uint8Array(config.tapeLength);
    this.#action = new Uint8Array(n);
    this.#moveRight = new Uint8Array(n);
    this.#newStatus = new Int32Array(n);
    this.#subRuleOnes = new Int32Array(n);
    this.#subRuleUsed = new Uint8Array(n);
    this.#statusUsed = new Uint8Array(n);
  }

  override initialize(): void {
    const { maxStati } = this.#config;
    this.maxOnes = 0;
    this.averageOnes = 0;
    this.steps = 0;
    if (this.#number === 0) this.type = 's';
    else if (this.#number % 3 === 2) this.type = 'r';
    else if (this.#number % 3 === 1) this.type = 'g';
    else this.type = 'm';

    const ruleLength = (this.#mode + 2) * 2 * maxStati;
    if (this.type === 's') this.#bsrLength = staticRule(maxStati).length;
    if (this.type === 'r') this.#brr = new RandomRuleSource(ruleLength, this.#seed());
    if (this.type === 'g') this.#bga = new RuleGa(100, ruleLength, this.#seed());
    if (this.type === 'm') {
      this.#mga = [];
      for (let i = 0; i < maxStati; i++) {
        this.#mga.push(new RuleGa(100, (this.#mode + 2) * 2, this.#seed()));
      }
    }
    this.#firstTime = true;
  }

  #seed(): number {
    return (this.random as Random).int(0, 1_000_000);
  }

  /** One step: 100 substeps (one more the first time for the static beaver). */
  step(): void {
    if (this.type === 's' && this.#firstTime) {
      this.#subStep();
      this.#firstTime = false;
    }
    for (let i = 0; i < this.#config.subStepPerStep; i++) this.#subStep();
  }

  /** Mean number of ones written per trial (`NaN` before the first trial). */
  get meanOnes(): number {
    return this.averageOnes / this.steps;
  }

  #reset(): void {
    this.#status = 0;
    this.writtenOnes = 0;
    this.#trans = 0;
    this.#head = Math.trunc(this.#config.tapeLength / 2);
    this.#tape.fill(0);
    this.#subRuleOnes.fill(0);
    this.#subRuleUsed.fill(0);
    this.#statusUsed.fill(0);
  }

  /** Decodes entry `i` of a rule string into table slot `slot`. */
  #decode(rule: string, i: number, slot: number): void {
    const mode = this.#mode;
    const at = (k: number) => rule[i * (mode + 2) + k] === '1';
    this.#action[slot] = at(0) ? 1 : 0;
    this.#moveRight[slot] = at(1) ? 1 : 0;
    let s = 0;
    if (mode === 2) {
      if (at(2)) s += 2;
      if (at(3)) s += 1;
    } else {
      if (at(2)) s += 4;
      if (at(3)) s += 2;
      if (at(4)) s += 1;
    }
    this.#newStatus[slot] = s;
  }

  #decodeAll(rule: string): void {
    for (let i = 0; i < this.#config.maxStati * 2; i++) this.#decode(rule, i, i);
  }

  #setGeneticSubRules(st: number): void {
    const ga = this.#mga[st]!;
    ga.step();
    const rule = ga.currentRuleString;
    for (let i = 0; i < 2; i++) this.#decode(rule, i, i + st * 2);
  }

  #subStep(): void {
    const { maxStati, maxTrans, tapeLength } = this.#config;
    const n = maxStati * 2;
    this.#reset();
    this.steps++;
    if (this.type === 's') this.#decodeAll(staticRule(maxStati));
    if (this.type === 'r') this.#decodeAll(this.#brr!.getCurrentRule());
    if (this.type === 'g') {
      this.#bga!.step();
      this.#decodeAll(this.#bga!.currentRuleString);
    }

    let p = 0;
    while (this.#status < maxStati && this.#trans < maxTrans) {
      const v = this.#tape[this.#head]!;
      const s = this.#status;
      if (!this.#statusUsed[s]) {
        this.#statusUsed[s] = 1;
        for (let i = 0; i < n; i++) if (this.#subRuleUsed[i]) this.#subRuleOnes[i]!++;
        if (this.type === 'm') this.#setGeneticSubRules(s);
      }
      p = s * 2;
      if (v === 1) p++;
      this.#subRuleUsed[p] = 1;

      let w = 0;
      if (v === 0 && this.#action[p] === 1) w = 1;
      if (v === 1 && this.#action[p] === 0) w = -1;
      if (w !== 0) {
        for (let i = 0; i < n; i++) if (this.#subRuleUsed[i]) this.#subRuleOnes[i]! += w;
      }
      this.#tape[this.#head] = this.#action[p]!;
      this.#head += this.#moveRight[p] ? 1 : -1;
      this.#status = this.#newStatus[p]!;
      this.#trans++;
    }

    if (this.#trans < maxTrans) {
      for (let i = 0; i < tapeLength; i++) if (this.#tape[i] === 1) this.writtenOnes++;
      this.#subRuleOnes[p]! += this.writtenOnes;
    } else {
      this.writtenOnes = -1;
      const w = this.#subRuleOnes[p]!;
      for (let i = 0; i < n; i++) if (this.#subRuleUsed[i]) this.#subRuleOnes[i]! -= w;
    }

    this.averageOnes += this.writtenOnes;

    if (this.type === 'g') {
      let w = 0;
      for (let i = 0; i < n; i++) w += this.#subRuleOnes[i]!;
      this.#bga!.setReward(w);
    }
    if (this.type === 'm') {
      for (let i = 0; i < maxStati; i++) {
        const w = this.#subRuleOnes[i * 2]! + this.#subRuleOnes[i * 2 + 1]!;
        if (this.#statusUsed[i]) this.#mga[i]!.setReward(w);
      }
    }

    // The legacy code then calls write(), which only prints the machine to the console.
    if (this.maxOnes < this.writtenOnes) this.maxOnes = this.writtenOnes;
  }

  /** The length of the static rule string (for tests). */
  get staticRuleLength(): number {
    return this.#bsrLength;
  }
}
