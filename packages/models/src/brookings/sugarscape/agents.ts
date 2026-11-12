// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.sugarscape.SugarAgent, PollutingSugarAgent,
// SexualAgent, CulturalSexualAgent, SpiceAgent, NegotiatingAgent, SexualSpiceAgent.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { Occupant, type Rule } from '@metascape/engine';
import { findMaximum, findRandomUnoccupiedCell, lineOfSight, UNIQUE_SERIES } from './ascape-space';
import type { PollutableSugarCell, SpiceCell, SugarCell } from './cells';
import type { Exchange, Exchange2 } from './exchange';
import { CommodityStock, type SugarscapeWorld } from './world';

/** Java's `randomInRange(low, high)`: an integer in low..high inclusive. */
function randomInRange(agent: SugarAgent, low: number, high: number): number {
  return agent.random.int(low, high + 1);
}

/** Java's `randomIs()`. */
function randomIs(agent: SugarAgent): boolean {
  return agent.random.chance(0.5);
}

/**
 * `SugarAgent`: a basic Sugarscape citizen with vision, sugar metabolism, a
 * sugar stock, an age and a death age.
 */
export class SugarAgent extends Occupant<SugarCell> {
  readonly world: SugarscapeWorld;
  sugar = new CommodityStock();
  age = 0;
  vision = 0;
  sugarMetabolism = 0;
  deathAge = 0;

  constructor(world: SugarscapeWorld) {
    super();
    this.world = world;
  }

  /** A new, uninitialized agent of the same kind: what `clone()` gave the reproduction rules. */
  newOfSameKind(): SugarAgent {
    return new SugarAgent(this.world);
  }

  /**
   * Random placement on a free cell, then death age, age (0..death age),
   * vision, sugar metabolism and initial sugar, drawn in the legacy order.
   */
  override initialize(): void {
    const s = this.world.settings;
    this.sugar = new CommodityStock();
    const cell = findRandomUnoccupiedCell(this.world.grid, this.random);
    if (cell) this.moveTo(cell);
    this.deathAge = randomInRange(this, s.minDeathAge, s.maxDeathAge);
    this.age = randomInRange(this, 0, this.deathAge);
    this.vision = randomInRange(this, s.minVision, s.maxVision);
    this.sugarMetabolism = randomInRange(this, s.minSugarMetabolism, s.maxSugarMetabolism);
    this.sugar.stock = randomInRange(this, s.minInitialSugar, s.maxInitialSugar);
  }

  /** Takes all the sugar on its cell. */
  harvest(): void {
    if (this.cell) this.sugar.putStock(this.cell.takeSugar());
  }

  /**
   * Looks along the four lattice directions (and at its own cell) and picks
   * the cell of greatest perceived value, at random among equals, occupied or
   * not; it moves there only if that cell is free. If the best cell is taken
   * the agent stays put (Ascape `findMaximumWithin` then `isAvailable`).
   */
  movement(): void {
    const here = this.cell;
    if (!here) return;
    const visible = lineOfSight(this.world.grid, here, this.vision);
    const best = findMaximum(visible, (cell) => cell.getPerceivedValue(), this.random);
    if (best?.isAvailable) this.moveTo(best);
  }

  /** Pays the sugar metabolism and ages one tick. */
  metabolism(): void {
    this.sugar.reduceStock(this.sugarMetabolism);
    this.age++;
  }
}

/** `PollutingSugarAgent`: pollutes its cell by `beta` (50) times its metabolism every tick. */
export class PollutingSugarAgent extends SugarAgent {
  /** `beta`: pollution per unit of sugar metabolized. */
  static readonly BETA = 50;

  override newOfSameKind(): SugarAgent {
    return new PollutingSugarAgent(this.world);
  }

  override metabolism(): void {
    (this.cell as PollutableSugarCell | undefined)?.addPollution(
      this.sugarMetabolism * PollutingSugarAgent.BETA,
    );
    super.metabolism();
  }
}

/** The fertility ages `SexualAgent` and `SexualSpiceAgent` draw from (Java statics). */
export const REPRODUCTION_AGES = {
  minBegins: 12,
  maxBegins: 15,
  minFemaleEnds: 40,
  maxFemaleEnds: 50,
  minMaleEnds: 50,
  maxMaleEnds: 60,
} as const;

/** `SexualAgent`: a sugar agent with a sex and a fertile age range. */
export class SexualAgent extends SugarAgent {
  female = false;
  initialSugarEndowment = 0;
  beginReproductionAge = 0;
  endReproductionAge = 0;

  override newOfSameKind(): SugarAgent {
    return new SexualAgent(this.world);
  }

  override initialize(): void {
    super.initialize();
    this.initialSugarEndowment = this.sugar.stock;
    this.female = randomIs(this);
    const r = REPRODUCTION_AGES;
    this.beginReproductionAge = randomInRange(this, r.minBegins, r.maxBegins);
    this.endReproductionAge = this.female
      ? randomInRange(this, r.minFemaleEnds, r.maxFemaleEnds)
      : randomInRange(this, r.minMaleEnds, r.maxMaleEnds);
  }

  /** At most 5 sugar, or what it has. */
  getContributionToChild(): number {
    return Math.min(5, this.sugar.stock);
  }

  /** At least its initial endowment of sugar, and of fertile age. */
  isFertile(): boolean {
    return (
      this.sugar.stock >= this.initialSugarEndowment &&
      this.age >= this.beginReproductionAge &&
      this.age <= this.endReproductionAge
    );
  }
}

/** `CulturalSexualAgent`: a sexual agent carrying a tag string of cultural bits. */
export class CulturalSexualAgent extends SexualAgent {
  tag: boolean[] = [];

  override newOfSameKind(): SugarAgent {
    return new CulturalSexualAgent(this.world);
  }

  override initialize(): void {
    super.initialize();
    this.tag = [];
    for (let i = 0; i < this.world.tagLength; i++) this.tag.push(randomIs(this));
  }

  /** Flips one random bit of the neighbor's tag to match its own. */
  play(neighbor: CulturalSexualAgent): void {
    const position = this.random.int(0, this.tag.length);
    neighbor.tag[position] = this.tag[position]!;
  }

  /**
   * True if more than `ceil(length / 2)` (integer division first, so 5 for 11
   * bits) of the bits are set, false if more are clear; scans in order.
   */
  getMajority(): boolean {
    let count0 = 0;
    let count1 = 0;
    const majoritySize = Math.trunc(this.tag.length / 2);
    for (const bit of this.tag) {
      if (!bit) {
        count0++;
        if (count0 > majoritySize) return false;
      } else {
        count1++;
        if (count1 > majoritySize) return true;
      }
    }
    throw new Error('Internal Error in CulturalSexualAgent.getMajority');
  }
}

/** `aBigNumber` in `SpiceAgent`: the MRS of an agent with no sugar. */
const A_BIG_NUMBER = 100000;

/** `SpiceAgent`: an agent that needs both sugar and spice and can trade them. */
export class SpiceAgent extends SugarAgent {
  spice = new CommodityStock();
  spiceMetabolism = 0;

  override newOfSameKind(): SugarAgent {
    return new SpiceAgent(this.world);
  }

  override initialize(): void {
    super.initialize();
    const p = this.world.spiceSettings();
    this.spice = new CommodityStock();
    this.spiceMetabolism = randomInRange(this, p.minSpiceMetabolism, p.maxSpiceMetabolism);
    this.spice.stock = randomInRange(this, p.minInitialSpice, p.maxInitialSpice);
  }

  override harvest(): void {
    const cell = this.cell as SpiceCell | undefined;
    if (!cell) return;
    this.sugar.putStock(cell.takeSugar());
    this.spice.putStock(cell.takeSpice());
  }

  /** Pays both metabolisms. Ages twice per tick: the legacy code increments age here and in the superclass. */
  override metabolism(): void {
    super.metabolism();
    this.spice.reduceStock(this.spiceMetabolism);
    this.age++;
  }

  /**
   * Finds the best potential welfare among the free cells in sight that beat
   * its own cell; if any, moves to the nearest such cell, trying the four
   * directions at each distance in a random order.
   */
  override movement(): void {
    const here = this.cell as SpiceCell | undefined;
    if (!here) return;
    const sugarStock = this.sugar.stock;
    const spiceStock = this.spice.stock;
    const value = (cell: SpiceCell): number =>
      cell.getPotentialValue(sugarStock, spiceStock, this.sugarMetabolism, this.spiceMetabolism);
    const visible = lineOfSight(this.world.grid, here, this.vision) as SpiceCell[];
    let bestValue = value(visible[0]!);
    for (let i = 1; i < visible.length; i++) {
      const cell = visible[i]!;
      if (value(cell) > bestValue && cell.isAvailable) bestValue = value(cell);
    }
    if (value(visible[0]!) !== bestValue) {
      for (let i = 1; i <= this.vision; i++) {
        const series = UNIQUE_SERIES[4]![this.random.int(0, 24)]!;
        for (let j = 0; j < 4; j++) {
          const current = visible[i * 4 - series[j]! + 1]!;
          if (value(current) === bestValue && current.isAvailable) {
            this.moveTo(current);
            return;
          }
        }
      }
    }
  }

  /** Marginal rate of substitution at the given holdings (`spice <= 0` gives 1 / 100000). */
  calculateMRSAt(sugarStock: number, spiceStock: number): number {
    if (sugarStock <= 0) return A_BIG_NUMBER;
    if (spiceStock <= 0) return 1 / A_BIG_NUMBER;
    return (this.sugarMetabolism * spiceStock) / (this.spiceMetabolism * sugarStock);
  }

  /** Marginal rate of substitution now. Note `spice < 0` (not `<= 0`) here, so zero spice gives 0. */
  calculateMRS(): number {
    if (this.sugar.stock <= 0) return A_BIG_NUMBER;
    if (this.spice.stock < 0) return 1 / A_BIG_NUMBER;
    return (this.sugarMetabolism * this.spice.stock) / (this.spiceMetabolism * this.sugar.stock);
  }

  /** Cobb-Douglas welfare `w1^(m1/mt) * w2^(m2/mt)` at the given holdings. */
  calculateUtilityAt(sugarStock: number, spiceStock: number): number {
    const mt = this.sugarMetabolism + this.spiceMetabolism;
    return (
      Math.pow(sugarStock, this.sugarMetabolism / mt) *
      Math.pow(spiceStock, this.spiceMetabolism / mt)
    );
  }

  /** Welfare now. */
  calculateUtility(): number {
    return this.calculateUtilityAt(this.sugar.stock, this.spice.stock);
  }

  /** The opening price: the geometric mean of the two MRSs. */
  makeOffer(partner: SpiceAgent): number {
    return Math.sqrt(this.calculateMRS() * partner.calculateMRS());
  }

  /**
   * Accepts a valid trade that makes both better off, between agents valuing
   * the goods differently, and that does not make their MRSs cross.
   */
  acceptOffer(exchange: Exchange): boolean {
    return (
      exchange.tradeIsValid() &&
      exchange.selfGainsFromTrade > 0 &&
      exchange.partnerGainsFromTrade > 0 &&
      exchange.selfExAnteMRS !== exchange.partnerExAnteMRS &&
      !(
        exchange.selfExAnteMRS > exchange.partnerExAnteMRS !==
        exchange.selfExPostMRS > exchange.partnerExPostMRS
      )
    );
  }
}

/** Responses to an offer in a negotiation (`Exchange2.ACCEPT`, `REJECT`, `COUNTER`). */
export const OfferResponse = { ACCEPT: 0, REJECT: 1, COUNTER: 2 } as const;
/** One of {@link OfferResponse}. */
export type OfferResponse = (typeof OfferResponse)[keyof typeof OfferResponse];

/** `NegotiatingAgent`: a spice agent that haggles with offers and counter-offers. */
export class NegotiatingAgent extends SpiceAgent {
  negotiatingFactor = 0.5;
  firstOfferFactor = 2.0;
  maxNumOffers = 6;

  override newOfSameKind(): SugarAgent {
    return new NegotiatingAgent(this.world);
  }

  override initialize(): void {
    super.initialize();
    this.maxNumOffers = randomInRange(this, 2, 10);
    this.firstOfferFactor = 2.0;
    this.negotiatingFactor = 0.5;
  }

  /** Opens at its own MRS divided (buying sugar) or multiplied (selling) by the first-offer factor. */
  override makeOffer(partner: SpiceAgent): number {
    if (this.calculateMRS() > partner.calculateMRS()) {
      return this.calculateMRS() / this.firstOfferFactor;
    }
    return this.calculateMRS() * this.firstOfferFactor;
  }

  /** The counter-offer to an exchange, as in the legacy code. */
  counterOffer(exchange: Exchange2): number {
    const last = exchange.iteration > 0 ? exchange.iteration - 1 : 0;
    if (exchange.iteration < 1) {
      if (!exchange.isBuyingSugar()) {
        return Math.min(this.calculateMRS(), exchange.price) / this.firstOfferFactor;
      }
      return Math.max(this.calculateMRS(), exchange.price) * this.firstOfferFactor;
    }
    if (exchange.iteration >= this.maxNumOffers - 2) return this.calculateMRS();
    if (exchange.isBuyingSugar()) {
      const delta = exchange.offerList[last]! - exchange.price;
      return exchange.price + delta * this.negotiatingFactor;
    }
    const delta = exchange.price - exchange.offerList[last]!;
    return exchange.price - delta * this.negotiatingFactor;
  }

  /** Accepts, rejects or counters an offer, as in the legacy code. */
  offerResponse(exchange: Exchange2): OfferResponse {
    const mrs = this.calculateMRS();
    const buying = exchange.isBuyingSugar();
    const valid = exchange.tradeIsValid();
    if (
      (buying && exchange.price > mrs * this.firstOfferFactor && valid) ||
      (!buying && exchange.price < mrs / this.firstOfferFactor && valid)
    ) {
      return OfferResponse.ACCEPT;
    }
    if (exchange.iteration >= this.maxNumOffers - 2) {
      if ((buying && valid && exchange.price > mrs) || (!buying && valid && exchange.price < mrs)) {
        return OfferResponse.ACCEPT;
      }
    }
    for (let i = exchange.iteration; i >= 0; i -= 2) {
      if (exchange.offerList[i] === mrs) return OfferResponse.REJECT;
    }
    if (exchange.iteration >= this.maxNumOffers - 1) {
      if (
        (!buying && valid && exchange.price <= mrs) ||
        (buying && valid && exchange.price >= mrs)
      ) {
        return OfferResponse.ACCEPT;
      }
      return OfferResponse.REJECT;
    }
    return OfferResponse.COUNTER;
  }
}

/** `SexualSpiceAgent`: a negotiating spice agent with a sex and a fertile age range. */
export class SexualSpiceAgent extends NegotiatingAgent {
  female = false;
  initialSugarEndowment = 0;
  initialSpiceEndowment = 0;
  beginReproductionAge = 0;
  endReproductionAge = 0;

  override newOfSameKind(): SugarAgent {
    return new SexualSpiceAgent(this.world);
  }

  override initialize(): void {
    super.initialize();
    this.initialSugarEndowment = this.sugar.stock;
    this.initialSpiceEndowment = this.spice.stock;
    this.female = randomIs(this);
    const r = REPRODUCTION_AGES;
    this.beginReproductionAge = randomInRange(this, r.minBegins, r.maxBegins);
    this.endReproductionAge = this.female
      ? randomInRange(this, r.minFemaleEnds, r.maxFemaleEnds)
      : randomInRange(this, r.minMaleEnds, r.maxMaleEnds);
  }

  getSugarContributionToChild(): number {
    return this.initialSugarEndowment / 2;
  }

  getSpiceContributionToChild(): number {
    return this.initialSpiceEndowment / 2;
  }

  /** At least its initial endowments of sugar and spice, and of fertile age. */
  isFertile(): boolean {
    return (
      this.sugar.stock >= this.initialSugarEndowment &&
      this.spice.stock >= this.initialSpiceEndowment &&
      this.age >= this.beginReproductionAge &&
      this.age <= this.endReproductionAge
    );
  }
}

/** `Agent.MOVEMENT_RULE`: calls `movement()`. */
export const MOVEMENT_RULE: Rule<SugarAgent> = {
  name: 'Movement',
  execute: (agent) => agent.movement(),
};

/** `SugarAgent.HARVEST_RULE`. */
export const HARVEST_RULE: Rule<SugarAgent> = {
  name: 'Harvest',
  execute: (agent) => agent.harvest(),
};

/** `Agent.METABOLISM_RULE`: calls `metabolism()`. */
export const METABOLISM_RULE: Rule<SugarAgent> = {
  name: 'Metabolism',
  execute: (agent) => agent.metabolism(),
};

/** `SugarAgent.DEATH_STARVATION_RULE`: dies with no sugar left. */
export const DEATH_STARVATION_RULE: Rule<SugarAgent> = {
  name: 'Death Starvation',
  execute: (agent) => {
    if (agent.sugar.stock <= 0) agent.die();
  },
};

/** `SugarAgent.DEATH_STARVATION_OLD_AGE_RULE`: dies with no sugar left or at its death age. */
export const DEATH_STARVATION_OLD_AGE_RULE: Rule<SugarAgent> = {
  name: 'Death Starvation or Old Age',
  execute: (agent) => {
    if (agent.sugar.stock <= 0 || agent.age >= agent.deathAge) agent.die();
  },
};

/** `SpiceAgent.DEATH_STARVATION_SPICE_RULE`: dies with no sugar or no spice left. */
export const DEATH_STARVATION_SPICE_RULE: Rule<SpiceAgent> = {
  name: 'Death From Starvation',
  execute: (agent) => {
    if (agent.sugar.stock <= 0 || agent.spice.stock <= 0) agent.die();
  },
};

/** `SpiceAgent.DEATH_STARVATION_OLD_AGE_SPICE_RULE`: also dies at its death age. */
export const DEATH_STARVATION_OLD_AGE_SPICE_RULE: Rule<SpiceAgent> = {
  name: 'Death From Starvation and/or Old Age',
  execute: (agent) => {
    if (agent.sugar.stock <= 0 || agent.spice.stock <= 0 || agent.age >= agent.deathAge) {
      agent.die();
    }
  },
};

/** `Cell.PLAY_NEIGHBORS_RULE` for cultural agents: plays every neighboring occupant in neighbor order. */
export const PLAY_NEIGHBORS_RULE: Rule<CulturalSexualAgent> = {
  name: 'Play Neighbors',
  execute: (agent) => {
    for (const neighbor of agent.neighboringOccupants()) {
      agent.play(neighbor as CulturalSexualAgent);
    }
  },
};
