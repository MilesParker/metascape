// SPDX-License-Identifier: EPL-2.0
import { RootScape } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { family, markets } from './index';
import { AdjacencyGraph, Firm, Instrument, InstrumentStatus, Trader } from './markets';

const make = (seed: number | string = 1, parameters = {}) =>
  new RootScape(markets, { seed, parameters });

describe('markets', () => {
  it('has the AMP defaults, a family entry and no invented authorship', () => {
    expect(markets.parameters.traderCount.default).toBe(10);
    expect(markets.parameters.firmCount.default).toBe(5);
    expect(markets.parameters.sharePriceAdjustmentMinimum.default).toBe(0.98);
    expect(markets.parameters.firmSharesCount.default).toBe(10000);
    expect(markets.provenance?.authors).toBeUndefined();
    expect(markets.provenance?.citation).toBeUndefined();
    expect(markets.provenance?.portedFrom).toBe('Eclipse AMP, Markets.metaabm');
    expect(family.models).toEqual([markets]);
  });

  it('starts with every firm having offered all its shares to traders', () => {
    const root = make(1);
    expect(root.data.latest('instruments')).toBe(50);
    const traders = root.findScape('traders').members as readonly Trader[];
    expect(traders.reduce((a, t) => a + t.instrumentCount, 0)).toBe(50);
    const firms = root.findScape('firms').members as readonly Firm[];
    for (const firm of firms) expect(firm.sharesInternal).toBe(0);
    for (const instrument of root.findScape('instruments').members as readonly Instrument[]) {
      expect(instrument.status).toBe(InstrumentStatus.held);
      expect(instrument.shares).toBe(1000);
    }
    for (const trader of traders) expect(trader.funds).toBe(50000);
  });

  it('runs 100 periods, with views over recorded series', () => {
    const root = make(2);
    root.run(100);
    const known = new Set(root.data.series.map((s) => s.id));
    for (const view of root.allViews) {
      if (view.type === 'timeSeries' || view.type === 'bars') {
        for (const id of view.series) expect(known.has(id)).toBe(true);
      }
    }
    expect(root.allViews.some((v) => v.type === 'timeSeries')).toBe(true);
  });

  it('is deterministic for a seed and differs between seeds', () => {
    const csv = (seed: number) => {
      const root = make(seed);
      root.run(100);
      return root.data.toCSV();
    };
    expect(csv(3)).toBe(csv(3));
    expect(csv(3)).not.toBe(csv(4));
  });

  it('conserves instruments and never creates funds', () => {
    const root = make(5, { traderCount: 20 });
    const traders = root.findScape('traders').members as readonly Trader[];
    const total = () => traders.reduce((a, t) => a + t.funds, 0);
    const start = total();
    let previous = start;
    for (let t = 0; t < 150; t++) {
      root.iterate();
      expect(root.data.latest('instruments')).toBe(50);
      expect(traders.reduce((a, x) => a + x.instrumentCount, 0)).toBe(50);
      expect(total()).toBeLessThanOrEqual(previous + 1e-6);
      previous = total();
    }
  });

  it('trades: prices of firms move and funds spread out', () => {
    const root = make(6);
    const prices = (root.findScape('firms').members as readonly Firm[]).map((f) => f.lastPrice);
    root.run(200);
    const after = (root.findScape('firms').members as readonly Firm[]).map((f) => f.lastPrice);
    expect(after).not.toEqual(prices);
    expect(root.data.latest('traderFunds.max')).toBeGreaterThan(
      root.data.latest('traderFunds.min'),
    );
  });

  it('clears all offers at the end of every period', () => {
    const root = make(7);
    for (let t = 0; t < 30; t++) {
      root.iterate();
      expect(root.data.latest('instrumentsAsk')).toBe(0);
    }
  });

  it('keeps firm earnings within the movement factors each period', () => {
    const root = make(8);
    const firm = root.findScape('firms').members[0] as Firm;
    const before = firm.lastEarnings;
    root.iterate();
    expect(firm.lastEarnings / before).toBeGreaterThanOrEqual(0.99);
    expect(firm.lastEarnings / before).toBeLessThanOrEqual(1.01);
  });
});

describe('AdjacencyGraph', () => {
  it('clears a node in both directions, removing one occurrence per listed neighbour', () => {
    const root = make(1);
    const [a, b, c] = root.findScape('traders').members.slice(0, 3);
    const graph = new AdjacencyGraph();
    graph.addNeighborSafe(a!, b!, false);
    graph.addNeighborSafe(a!, c!, false);
    graph.addNeighborSafe(a!, b!, false);
    expect(graph.neighbors(a!)).toEqual([b, c, b]);
    graph.clearNeighbors(a!);
    expect(graph.neighbors(a!)).toEqual([]);
    expect(graph.neighbors(b!)).toEqual([]);
    expect(graph.neighbors(c!)).toEqual([]);
  });
});
