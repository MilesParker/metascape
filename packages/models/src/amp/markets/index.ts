// SPDX-License-Identifier: EPL-2.0
import source from '@metascape/spec/examples/escape/Markets.model.json';
import { defineFamily } from '../../catalog';
import { AMP_COPYRIGHT, fromMetaabm } from '../metaabm';

export const markets = fromMetaabm(source, {
  name: 'Markets',
  description:
    "Traders hold instruments, parcels of shares in firms, and each period ask a new price for one they hold; a trader then picks a random firm and buys an asked instrument of that firm if it can afford it, which also sets the firm's last price. Firm earnings drift randomly.",
  provenance: {
    portedFrom: 'Eclipse AMP, Markets.metaabm',
    copyright: AMP_COPYRIGHT,
    note: "The model carries no description, author or citation. A sale disconnects the seller, which removes all of the seller's links, as the generated code did.",
  },
  charts: [
    {
      title: 'Firm last price',
      series: ['firm.lastPrice.mean', 'firm.lastPrice.min', 'firm.lastPrice.max'],
    },
    {
      title: 'Firm earnings',
      series: ['firm.lastEarnings.mean', 'firm.lastEarnings.min', 'firm.lastEarnings.max'],
    },
    {
      title: 'Trader funds',
      series: ['trader.funds.mean', 'trader.funds.min', 'trader.funds.max'],
    },
  ],
});

/** The Eclipse AMP Markets model. */
export const family = defineFamily({
  id: 'amp-markets',
  name: 'Markets',
  collection: 'Eclipse AMP example models',
  tags: ['markets', 'economics'],
  description:
    'Traders, firms and parcels of shares: a small ask-and-buy market in which firm prices follow the trades.',
  models: [markets],
});
