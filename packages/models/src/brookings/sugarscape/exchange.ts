// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.sugarscape.Exchange, Exchange2.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import type { SpiceAgent } from './agents';

/**
 * `Exchange`: a potential trade between an agent (`self`) and a partner at
 * some price (units of spice per unit of sugar), with the holdings, welfare
 * gains and MRSs each would have afterwards.
 */
export class Exchange {
  readonly self: SpiceAgent;
  readonly partner: SpiceAgent;
  price: number;
  logPrice: number;
  sugarQuantity = 0;
  spiceQuantity = 0;
  selfExAnteMRS: number;
  partnerExAnteMRS: number;
  selfExPostMRS = 0;
  partnerExPostMRS = 0;
  selfGainsFromTrade = 0;
  partnerGainsFromTrade = 0;
  buyingSugar = false;
  selfExPostSugar = 0;
  selfExPostSpice = 0;
  partnerExPostSugar = 0;
  partnerExPostSpice = 0;

  /** At `setPrice`, or at `self.makeOffer(partner)` if none is given. */
  constructor(self: SpiceAgent, partner: SpiceAgent, setPrice?: number) {
    this.self = self;
    this.partner = partner;
    this.selfExAnteMRS = self.calculateMRS();
    this.partnerExAnteMRS = partner.calculateMRS();
    this.price = setPrice ?? self.makeOffer(partner);
    this.logPrice = Math.log(this.price);
    // One unit of the dearer good against `price` (or 1 / price) of the other.
    if (this.price > 1) {
      this.sugarQuantity = 1.0;
      this.spiceQuantity = this.price;
    } else {
      this.sugarQuantity = this.price;
      this.spiceQuantity = 1.0;
    }
    this.computeExPost();
  }

  /** Recomputes holdings, gains and MRSs after the trade from the current quantities. */
  protected computeExPost(): void {
    const { self, partner } = this;
    this.buyingSugar = this.isBuyingSugar();
    if (this.isBuyingSugar()) {
      this.selfExPostSugar = self.sugar.stock + this.sugarQuantity;
      this.selfExPostSpice = self.spice.stock - this.spiceQuantity;
      this.partnerExPostSugar = partner.sugar.stock - this.sugarQuantity;
      this.partnerExPostSpice = partner.spice.stock + this.spiceQuantity;
    } else {
      this.selfExPostSugar = self.sugar.stock - this.sugarQuantity;
      this.selfExPostSpice = self.spice.stock + this.spiceQuantity;
      this.partnerExPostSugar = partner.sugar.stock + this.sugarQuantity;
      this.partnerExPostSpice = partner.spice.stock - this.spiceQuantity;
    }
    this.selfGainsFromTrade =
      self.calculateUtilityAt(this.selfExPostSugar, this.selfExPostSpice) - self.calculateUtility();
    this.partnerGainsFromTrade =
      partner.calculateUtilityAt(this.partnerExPostSugar, this.partnerExPostSpice) -
      partner.calculateUtility();
    this.selfExPostMRS = self.calculateMRSAt(this.selfExPostSugar, this.selfExPostSpice);
    this.partnerExPostMRS = partner.calculateMRSAt(
      this.partnerExPostSugar,
      this.partnerExPostSpice,
    );
  }

  /** True if `self` values sugar more than the partner does, so gives spice for sugar. */
  isBuyingSugar(): boolean {
    return this.selfExAnteMRS > this.partnerExAnteMRS;
  }

  /** Neither side loses welfare and both quantities are positive. */
  tradeIsValid(): boolean {
    if (!(this.selfGainsFromTrade >= 0 && this.partnerGainsFromTrade >= 0)) return false;
    if (!(this.sugarQuantity > 0 && this.spiceQuantity > 0)) return false;
    return true;
  }
}

/** `Exchange2.MAXNUMOFFERS`. */
export const MAX_NUM_OFFERS = 20;

/**
 * `Exchange2`: an exchange sized to the largest beneficial and affordable
 * quantity at the price, and carrying the history of a negotiation.
 *
 * Kept from the legacy code: with no price given, the holdings, gains and
 * MRSs after the trade are those of the one-unit trade computed by
 * `Exchange`; the resized quantities only enter `tradeIsValid`.
 */
export class Exchange2 extends Exchange {
  selfOptSpiceQuantity = 0;
  partnerOptSpiceQuantity = 0;
  iteration = 0;
  /** Offers and counter-offers so far; unused entries are 0. */
  readonly offerList: number[] = new Array<number>(MAX_NUM_OFFERS + 1).fill(0);

  constructor(
    self: SpiceAgent,
    partner: SpiceAgent,
    price?: number,
    list?: readonly number[],
    count?: number,
  ) {
    super(self, partner);
    if (price === undefined) {
      this.selfOptSpiceQuantity = Math.abs(this.optSpiceQuantity(self));
      this.partnerOptSpiceQuantity = Math.abs(this.optSpiceQuantity(partner));
      this.calculateQuantities();
      this.iteration = 0;
      return;
    }
    this.price = price;
    this.logPrice = Math.log(price);
    this.iteration = count ?? 0;
    if (list && count !== undefined) {
      for (let i = 0; i < count; i++) this.offerList[i] = list[i]!;
    }
    this.selfExAnteMRS = self.calculateMRS();
    this.partnerExAnteMRS = partner.calculateMRS();
    this.selfOptSpiceQuantity = Math.abs(this.optSpiceQuantity(self));
    this.partnerOptSpiceQuantity = Math.abs(this.optSpiceQuantity(partner));
    this.calculateQuantities();
    this.computeExPost();
  }

  /** Spice traded that would bring the agent's MRS to 1 at the price. */
  private optSpiceQuantity(agent: SpiceAgent): number {
    const mr = agent.sugarMetabolism / agent.spiceMetabolism;
    return (mr * agent.spice.stock - agent.sugar.stock) / (1.0 + this.price * mr);
  }

  /** The largest beneficial quantities at the price that leave both a tick's metabolism. */
  private calculateQuantities(): void {
    const { self, partner, price } = this;
    const selfSpiceReqd = self.spice.stock - self.spiceMetabolism;
    const selfSugarReqd = self.sugar.stock - self.sugarMetabolism;
    const partnerSpiceReqd = partner.spice.stock - partner.spiceMetabolism;
    const partnerSugarReqd = partner.sugar.stock - partner.sugarMetabolism;
    const minSpice = Math.min(
      this.selfOptSpiceQuantity,
      this.partnerOptSpiceQuantity,
      selfSpiceReqd,
      partnerSpiceReqd,
    );
    const minSugar = Math.min(
      this.selfOptSpiceQuantity / price,
      this.partnerOptSpiceQuantity / price,
      selfSugarReqd,
      partnerSugarReqd,
    );
    if (minSpice <= minSugar * price) {
      this.spiceQuantity = minSpice;
      this.sugarQuantity = this.spiceQuantity / price;
    } else {
      this.sugarQuantity = minSugar;
      this.spiceQuantity = this.sugarQuantity * price;
    }
  }
}
