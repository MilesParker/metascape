// SPDX-License-Identifier: EPL-2.0
//
// Ported to Metascape from the Eclipse Agent Modeling Platform example model Markets.metaabm.
// Original: Copyright (c) Metascape LLC and others, made available under the Eclipse Public License
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  Agent,
  barsView,
  colors,
  defineModel,
  histogramView,
  int,
  real,
  Scape,
  timeSeriesView,
} from '@metascape/engine';

/** Status of an {@link Instrument}, numbered as the options of the AMP `status` attribute. */
export const InstrumentStatus = { ask: 0, held: 1, bid: 2 } as const;
export type InstrumentStatus = (typeof InstrumentStatus)[keyof typeof InstrumentStatus];

/** Trading strategies, as the options of the AMP `strategy` attribute. Not used by any rule. */
export const strategies = ['value', 'momentum', 'random'] as const;
export type Strategy = (typeof strategies)[number];

/**
 * A graph with Ascape's `Graph` semantics: each agent has an ordered list of
 * neighbours in which duplicates are allowed, `addNeighborSafe` appends, and
 * `clearNeighbors` removes the agent from each of its neighbours' lists (one
 * occurrence each) and then empties its own list.
 */
export class AdjacencyGraph<A extends Agent = Agent> {
  readonly #adjacency = new Map<A, A[]>();

  /** The agent's neighbours in the order they were added. */
  neighbors(agent: A): readonly A[] {
    return this.#adjacency.get(agent) ?? [];
  }

  /** Adds `target` to `source`'s list, and `source` to `target`'s list unless directed. */
  addNeighborSafe(source: A, target: A, directed: boolean): void {
    this.#list(source).push(target);
    if (!directed) this.#list(target).push(source);
  }

  /** Removes the first occurrence of `target` from `source`'s list. */
  removeNeighbor(source: A, target: A): boolean {
    const list = this.#adjacency.get(source);
    const index = list ? list.indexOf(target) : -1;
    if (!list || index < 0) return false;
    list.splice(index, 1);
    return true;
  }

  /** Ascape's `clearNeighbors`: severs every link of the agent, in both directions. */
  clearNeighbors(source: A): void {
    const mine = this.#adjacency.get(source);
    if (!mine) return;
    for (const neighbor of [...mine]) this.removeNeighbor(neighbor, source);
    mine.length = 0;
  }

  /** The number of links in all lists; an undirected link counts twice. */
  get linkCount(): number {
    let total = 0;
    for (const list of this.#adjacency.values()) total += list.length;
    return total;
  }

  #list(agent: A): A[] {
    let list = this.#adjacency.get(agent);
    if (!list) this.#adjacency.set(agent, (list = []));
    return list;
  }
}

/** A trader with funds, who sells and buys instruments. */
export class Trader extends Agent {
  strategy: Strategy = 'random';
  funds = 100000;
  instrumentCount = 0;
}

/** A firm whose shares are offered as instruments. */
export class Firm extends Agent {
  sharesOutstanding = 0;
  lastEarnings = 0;
  lastPrice = 1.0;
  sharesInternal = 50000;
  /** Derived: last price divided by last earnings. */
  get priceEarningsRatio(): number {
    return this.lastPrice / this.lastEarnings;
  }
}

/** A parcel of a firm's shares, held by a trader. */
export class Instrument extends Agent {
  shares = 0;
  status: InstrumentStatus = InstrumentStatus.ask;
  offerPrice = 0;
  /** Derived: offer price times shares. */
  get totalPrice(): number {
    return this.offerPrice * this.shares;
  }
  /**
   * Derived in the AMP model from the firm's price-earnings ratio, but the
   * generated code leaves it unfinished and returns zero; so does this port.
   */
  get firmPriceEarningsRatio(): number {
    return 0;
  }
}

/** Provenance statement of Markets.metaabm: its description is empty. */
const copyright =
  'Copyright (c) Metascape LLC and others, made available under the Eclipse Public License';

const parameters = {
  traderCount: int(10, {
    min: 1,
    max: 500,
    label: 'Trader Count',
    description: 'The number of traders to create.',
  }),
  firmCount: int(5, {
    min: 1,
    max: 100,
    label: 'Firm Count',
    description: 'The number of firms to create.',
  }),
  initialFirmValueMinimum: real(100000, {
    min: 0,
    max: 1e9,
    label: 'Initial Firm Value Minimum',
    description: 'Lower bound of the initial earnings of a firm.',
  }),
  initialFirmValueMaximum: real(1000000, {
    min: 0,
    max: 1e9,
    label: 'Initial Firm Value Maximum',
    description: 'Upper bound of the initial earnings of a firm.',
  }),
  earningMovementFactorMinimum: real(0.99, {
    min: 0,
    max: 10,
    label: 'Earning Movement Factor Minimum',
    description: "Lower bound of the factor by which a firm's earnings change each period.",
  }),
  earningMovementFactorMaximum: real(1.01, {
    min: 0,
    max: 10,
    label: 'Earning Movement Factor Maximum',
    description: "Upper bound of the factor by which a firm's earnings change each period.",
  }),
  firmSharesperInstrument: int(1000, {
    min: 1,
    max: 1e6,
    label: 'Firm Shares per Instrument',
    description: 'The number of shares in each instrument a firm offers.',
  }),
  sharePriceAdjustmentMinimum: real(0.98, {
    min: 0,
    max: 10,
    label: 'Share Price Adjustment Minimum',
    description: "Lower bound of the factor applied to the firm's last price when a trader asks.",
  }),
  sharePriceAdjustmentMaximum: real(1.02, {
    min: 0,
    max: 10,
    label: 'Share Price Adjustment Maximum',
    description: "Upper bound of the factor applied to the firm's last price when a trader asks.",
  }),
  initialFirmPriceMinimum: real(10, {
    min: 0,
    max: 1e6,
    label: 'Initial Firm Price Minimum',
    description: 'Lower bound of the initial share price of a firm.',
  }),
  initialFirmPriceMaximum: real(30, {
    min: 0,
    max: 1e6,
    label: 'Initial Firm Price Maximum',
    description: 'Upper bound of the initial share price of a firm.',
  }),
  initialTraderFundsMinimum: real(50000, {
    min: 0,
    max: 1e9,
    label: 'Initial Trader Funds Minimum',
    description: 'Lower bound of the initial funds of a trader.',
  }),
  initialTraderFundsMaximum: real(50000, {
    min: 0,
    max: 1e9,
    label: 'Initial Trader Funds Maximum',
    description: 'Upper bound of the initial funds of a trader.',
  }),
  firmSharesCount: int(10000, {
    min: 0,
    max: 1e7,
    label: 'Firm Shares Count',
    description: 'The number of shares each firm starts with, all offered to traders at the start.',
  }),
} as const;

/** Markets.metaabm: traders buy and sell parcels of firms' shares through a simple ask-and-buy market. */
export const markets = defineModel({
  name: 'Markets',
  description:
    "Traders hold instruments, parcels of shares in firms, and each period ask a new price for one they hold; a trader then picks a random firm and buys an asked instrument of that firm if it can afford it, which also sets the firm's last price. Firm earnings drift randomly.",
  provenance: {
    portedFrom: 'Eclipse AMP, Markets.metaabm',
    copyright,
    note: "The model carries no description, author or citation. The disconnect act removes all of the seller's links (as the generated code does), and the generated code does not check an instrument's status or the buyer's funds in the buy; the metaabm does, and this port follows the metaabm.",
  },
  parameters,
  build(sim) {
    const p = sim.parameters;
    const traders = sim.addScape(
      new Scape<Trader>({
        name: 'traders',
        size: p.traderCount,
        schedule: 'byRule',
        create: () => new Trader(),
      }),
    );
    const firms = sim.addScape(
      new Scape<Firm>({
        name: 'firms',
        size: p.firmCount,
        schedule: 'byRule',
        create: () => new Firm(),
      }),
    );
    const instruments = sim.addScape(
      new Scape<Instrument>({ name: 'instruments', create: () => new Instrument() }),
    );
    const instrumentHolders = new AdjacencyGraph();
    const firmInstruments = new AdjacencyGraph();
    const targetBuyFirms = new AdjacencyGraph();

    const inRange = (agent: Agent, low: number, high: number): number =>
      agent.random.float() * (high - low) + low;
    const randomNeighbor = <T extends Agent>(
      random: { pick<U>(items: readonly U[]): U },
      graph: AdjacencyGraph,
      agent: Agent,
      type: abstract new () => T,
      keep: (candidate: T) => boolean = () => true,
    ): T | undefined => {
      const candidates = graph.neighbors(agent).filter((n): n is T => n instanceof type && keep(n));
      return candidates.length === 0 ? undefined : random.pick(candidates);
    };

    // Initialize (traders), then Initialize and Offer Shares (firms).
    traders.addInitialRule('initialize', (trader) => {
      trader.strategy = trader.random.pick(strategies);
      trader.funds = inRange(trader, p.initialTraderFundsMinimum, p.initialTraderFundsMaximum);
    });
    firms.addInitialRule('initialize', (firm) => {
      firm.sharesInternal = p.firmSharesCount;
      firm.lastEarnings = inRange(firm, p.initialFirmValueMinimum, p.initialFirmValueMaximum);
      firm.lastPrice = inRange(firm, p.initialFirmPriceMinimum, p.initialFirmPriceMaximum);
    });
    firms.addInitialRule('offer shares', (firm) => {
      // The AMP rule calls itself until the firm has no shares left, or there is no trader.
      while (firm.sharesInternal > 0) {
        firm.sharesInternal -= p.firmSharesperInstrument;
        const instrument = instruments.spawn();
        instrument.status = InstrumentStatus.held;
        firmInstruments.addNeighborSafe(firm, instrument, false);
        instrument.offerPrice = firm.lastPrice;
        instrument.shares = p.firmSharesperInstrument;
        const holder = traders.randomMember();
        if (!holder) break;
        instrumentHolders.addNeighborSafe(holder, instrument, false);
        holder.instrumentCount++;
      }
    });

    // Trader rules: Ask, Buy, Execute.
    traders.addRule('ask', (trader) => {
      const selling = randomNeighbor(
        trader.random,
        instrumentHolders,
        trader,
        Instrument,
        (i) => i.status === InstrumentStatus.held,
      );
      if (!selling) return;
      const firm = randomNeighbor(trader.random, firmInstruments, selling, Firm);
      if (!firm) return;
      const adjustment = inRange(
        trader,
        p.sharePriceAdjustmentMinimum,
        p.sharePriceAdjustmentMaximum,
      );
      selling.offerPrice = adjustment * firm.lastPrice;
      selling.status = InstrumentStatus.ask;
    });
    traders.addRule('buy', (trader) => {
      targetBuyFirms.clearNeighbors(trader);
      const offered = firms.randomMember();
      if (offered) targetBuyFirms.addNeighborSafe(trader, offered, false);
    });
    traders.addRule('execute', (trader) => {
      const firm = randomNeighbor(trader.random, targetBuyFirms, trader, Firm);
      if (!firm) return;
      const bought = randomNeighbor(
        trader.random,
        firmInstruments,
        firm,
        Instrument,
        (i) => i.status === InstrumentStatus.ask && i.totalPrice <= trader.funds,
      );
      if (!bought) return;
      bought.status = InstrumentStatus.held;
      trader.funds = trader.funds - bought.totalPrice;
      firm.lastPrice = bought.offerPrice + 0;
      const seller = randomNeighbor(trader.random, instrumentHolders, bought, Trader);
      if (!seller) return;
      seller.funds = seller.funds + bought.totalPrice;
      instrumentHolders.clearNeighbors(seller);
      instrumentHolders.addNeighborSafe(trader, bought, false);
      trader.instrumentCount = trader.instrumentCount + 1;
      seller.instrumentCount = seller.instrumentCount - 1;
    });

    // Firm rules: Modify Earnings, Clear Offers.
    firms.addRule('modify earnings', (firm) => {
      firm.lastEarnings =
        firm.lastEarnings *
        inRange(firm, p.earningMovementFactorMinimum, p.earningMovementFactorMaximum);
    });
    firms.addRule('clear offers', () => {
      for (const instrument of instruments.members) {
        if (instrument.status === InstrumentStatus.ask) instrument.status = InstrumentStatus.held;
      }
    });

    const summary = ['mean', 'min', 'max'] as const;
    sim.data.count(traders, 'traders');
    sim.data.measure(traders, 'traderFunds', (t) => t.funds, { statistics: [...summary, 'sum'] });
    sim.data.measure(traders, 'traderInstrumentCount', (t) => t.instrumentCount, {
      statistics: summary,
    });
    sim.data.count(firms, 'firms');
    sim.data.measure(firms, 'firmSharesOutstanding', (f) => f.sharesOutstanding, {
      statistics: summary,
    });
    sim.data.measure(firms, 'firmLastEarnings', (f) => f.lastEarnings, { statistics: summary });
    sim.data.measure(firms, 'firmLastPrice', (f) => f.lastPrice, { statistics: summary });
    sim.data.measure(firms, 'firmSharesInternal', (f) => f.sharesInternal, { statistics: summary });
    sim.data.count(instruments, 'instruments');
    sim.data.count(instruments, 'instrumentsAsk', (i) => i.status === InstrumentStatus.ask);
    sim.data.count(instruments, 'instrumentsHeld', (i) => i.status === InstrumentStatus.held);
    sim.data.count(instruments, 'instrumentsBid', (i) => i.status === InstrumentStatus.bid);
    sim.data.measure(instruments, 'instrumentOfferPrice', (i) => i.offerPrice, {
      statistics: summary,
    });
    sim.data.measure(instruments, 'instrumentTotalPrice', (i) => i.totalPrice, {
      statistics: summary,
    });
    sim.data.value('instrumentsWithHolder', () => {
      let held = 0;
      for (const instrument of instruments.members) {
        if (instrumentHolders.neighbors(instrument).length > 0) held++;
      }
      return held;
    });
    sim.data.distribution(traders, 'traderFundsDistribution', (t) => t.funds, {
      bins: 20,
      min: 0,
      max: Math.max(1, p.initialTraderFundsMaximum * 2),
    });

    sim.addView(
      timeSeriesView({
        title: 'Firm last price',
        series: ['firmLastPrice.mean', 'firmLastPrice.min', 'firmLastPrice.max'],
        colors: {
          'firmLastPrice.mean': colors.red,
          'firmLastPrice.min': colors.gray,
          'firmLastPrice.max': colors.orange,
        },
      }),
    );
    sim.addView(
      timeSeriesView({
        title: 'Instruments asked and held',
        series: ['instrumentsAsk', 'instrumentsHeld'],
        colors: { instrumentsAsk: colors.black, instrumentsHeld: colors.gray },
        yMin: 0,
      }),
    );
    sim.addView(
      timeSeriesView({
        title: 'Trader funds',
        series: ['traderFunds.mean', 'traderFunds.min', 'traderFunds.max'],
        colors: {
          'traderFunds.mean': colors.blue,
          'traderFunds.min': colors.gray,
          'traderFunds.max': colors.teal,
        },
      }),
    );
    sim.addView(
      barsView({
        title: 'Instruments by status now',
        series: ['instrumentsAsk', 'instrumentsHeld', 'instrumentsBid'],
        colors: {
          instrumentsAsk: colors.black,
          instrumentsHeld: colors.gray,
          instrumentsBid: colors.blue,
        },
      }),
    );
    sim.addView(
      histogramView({
        title: 'Trader funds',
        distribution: 'traderFundsDistribution',
        color: colors.blue,
      }),
    );
  },
});
