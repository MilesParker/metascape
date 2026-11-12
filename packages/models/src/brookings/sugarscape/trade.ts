// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.sugarscape.TradeT, TradeT2, TradeT3, TradeT4.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import type { Rule } from '@metascape/engine';
import { OfferResponse, type NegotiatingAgent, type SpiceAgent } from './agents';
import { randomSeries } from './ascape-space';
import { Exchange, Exchange2, MAX_NUM_OFFERS } from './exchange';

/** Counts of executed trades, for the models' charts. Not part of the legacy rules. */
export interface TradeTally {
  trades: number;
  /** Sum of the natural log of the prices of executed trades. */
  logPriceSum: number;
}

/** A fresh tally. */
export function newTally(): TradeTally {
  return { trades: 0, logPriceSum: 0 };
}

/** `TradeT.executeTrade`: both parties take the holdings the exchange computed. */
function executeTrade(exchange: Exchange, tally: TradeTally): void {
  exchange.self.sugar.stock = exchange.selfExPostSugar;
  exchange.self.spice.stock = exchange.selfExPostSpice;
  exchange.partner.sugar.stock = exchange.partnerExPostSugar;
  exchange.partner.spice.stock = exchange.partnerExPostSpice;
  tally.trades++;
  tally.logPriceSum += exchange.logPrice;
}

/**
 * `TradeT`: trade as in the book, repeatedly with each neighbor until the
 * partner refuses. A random visiting order is drawn, but (kept legacy
 * behaviour) the neighbors are then visited in plain list order.
 */
export function tradeT(tally: TradeTally): Rule<SpiceAgent> {
  return {
    name: 'Trade',
    execute(agent) {
      const neighbors = agent.neighboringOccupants() as SpiceAgent[];
      const series = randomSeries(agent.random, neighbors.length);
      for (let i = 0; i < series.length; i++) {
        const partner = neighbors[i]!;
        let exchange = new Exchange(agent, partner);
        while (partner.acceptOffer(exchange)) {
          executeTrade(exchange, tally);
          exchange = new Exchange(agent, partner);
        }
      }
    },
  };
}

/**
 * `TradeT2`: one larger trade (an `Exchange2`) with each neighbor, again in
 * list order despite the random draw.
 */
export function tradeT2(tally: TradeTally): Rule<SpiceAgent> {
  return {
    name: 'Trade',
    execute(agent) {
      const neighbors = agent.neighboringOccupants() as SpiceAgent[];
      const series = randomSeries(agent.random, neighbors.length);
      for (let i = 0; i < series.length; i++) {
        const partner = neighbors[i]!;
        const exchange = new Exchange2(agent, partner);
        if (partner.acceptOffer(exchange)) executeTrade(exchange, tally);
      }
    },
  };
}

/**
 * `TradeT3`: asks every neighbor for an offer, trades with the one whose price
 * is farthest (in log) from its own MRS, then offers that price to the others.
 * Deviation: with exactly one neighbor the legacy code casts the neighbor list
 * itself to an agent and throws; this port trades with that neighbor instead.
 */
export function tradeT3(tally: TradeTally): Rule<SpiceAgent> {
  return {
    name: 'Trade',
    execute(agent) {
      const neighbors = agent.neighboringOccupants() as SpiceAgent[];
      if (neighbors.length === 1) {
        const partner = neighbors[0]!;
        const exchange = new Exchange2(agent, partner);
        if (partner.acceptOffer(exchange)) executeTrade(exchange, tally);
        return;
      }
      let imax = -1;
      let maxDif = 0;
      const exchanges: Exchange2[] = [];
      for (let i = 0; i < neighbors.length; i++) {
        const exchange = new Exchange2(agent, neighbors[i]!);
        exchanges[i] = exchange;
        const transDif = Math.abs(exchange.logPrice - Math.log(exchange.selfExAnteMRS));
        if (transDif > maxDif) {
          maxDif = transDif;
          imax = i;
        }
      }
      if (imax < 0) return;
      const best = exchanges[imax]!;
      if (neighbors[imax]!.acceptOffer(best)) executeTrade(best, tally);
      for (let i = 0; i < neighbors.length; i++) {
        if (i === imax) continue;
        const exchange = new Exchange2(agent, neighbors[i]!, best.price);
        if (neighbors[i]!.acceptOffer(exchange)) executeTrade(exchange, tally);
      }
    },
  };
}

/**
 * `TradeT4`: negotiation. With each neighbor (list order, despite the random
 * draw) the agent opens with its offer; the parties then swap roles, making
 * counter-offers, until one is accepted or rejected. Kept legacy behaviour:
 * every response, whoever made the latest offer, is asked of the neighbor.
 */
export function tradeT4(tally: TradeTally): Rule<NegotiatingAgent> {
  return {
    name: 'Trade',
    execute(agent) {
      const neighbors = agent.neighboringOccupants() as NegotiatingAgent[];
      const series = randomSeries(agent.random, neighbors.length);
      const offerList = new Array<number>(MAX_NUM_OFFERS + 1).fill(0);
      for (let i = 0; i < series.length; i++) {
        const neighbor = neighbors[i]!;
        let tradeIteration = 0;
        let self: NegotiatingAgent = agent;
        let other: NegotiatingAgent = neighbor;
        let exchange = new Exchange2(self, other);
        let response = neighbor.offerResponse(exchange);
        if (response === OfferResponse.ACCEPT) {
          executeTrade(exchange, tally);
          continue;
        }
        if (response === OfferResponse.REJECT) continue;
        while (response === OfferResponse.COUNTER) {
          const price = other.counterOffer(exchange);
          offerList[tradeIteration] = exchange.price;
          tradeIteration++;
          [self, other] = [other, self];
          exchange = new Exchange2(self, other, price, offerList, tradeIteration);
          response = neighbor.offerResponse(exchange);
        }
        if (response === OfferResponse.ACCEPT) executeTrade(exchange, tally);
      }
    },
  };
}
