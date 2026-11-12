# Markets

A small market ported from the Eclipse Agent Modeling Platform (AMP) example model `Markets.metaabm` (project `org.eclipse.amp.amf.examples.escape`).

Firms offer their shares as instruments (parcels of 1000 shares) to random traders at the start. Each period every trader asks a new price (firm price times a random factor near 1) for one instrument it holds; then each trader picks a random firm and buys one of that firm's instruments that is being asked and affordable, which sets the firm's last price and moves the money. Firms' earnings drift by a random factor and unsold asks are cleared at the end of each period.

- Authors and citation: none. The model's description is empty, so none is given (none is invented).
- Copyright: the model has no copyright statement. The files carry "Copyright (c) Metascape LLC and others, made available under the Eclipse Public License".
- Licence of this port: EPL-2.0.

## Legacy classes

| Legacy class                                            | New model or shared file | Status                  |
| ------------------------------------------------------- | ------------------------ | ----------------------- |
| `name.milesparker.markets.Markets`                      | `markets.ts` (`markets`) | ported                  |
| `name.milesparker.markets.Trader`, `Firm`, `Instrument` | `markets.ts`             | ported                  |
| `name.milesparker.markets.StatusEnum`, `StrategyEnum`   | `markets.ts`             | folded into shared code |
| `*Style2D*`, `*Provider`, `*Adapter*`, `Markets3D`      | view specs               | not ported: UI only     |

## Reading the acts

The three networks (`instrumentHolders`, `firmInstruments`, `targetBuyFirms`) are kept in a local `AdjacencyGraph` with Ascape `Graph` semantics (ordered lists, repeats allowed, `clearNeighbors` removes the agent from its neighbours' lists then empties its own), because the engine `Network` has different semantics. Scapes run in the order trader, firm, instrument; traders run Ask, Buy, Execute rule by rule over random orders, then firms run Modify Earnings, Clear Offers. Initially traders Initialize, then firms Initialize and Offer Shares (which calls itself until the firm's internal shares are used up; each instrument goes to a random trader).

## Deviations and kept oddities

- The generated Java in `srcgen` is older than the `.metaabm`: its Ask does not require the instrument to be held, and its Execute does not require the instrument to be asked or affordable. The `.metaabm` has those conditions, and this port follows the `.metaabm`.
- Kept (apparent bug): the `Disconnect` act of a sale is generated as `clearNeighbors(seller)`, which severs ALL of the seller's links, not just the one to the sold instrument. After a sale the seller's other instruments have no holder: they cannot be asked and cannot be sold again, although the seller's `instrumentCount` goes down by one only. The series `instrumentsWithHolder` shows this. The port does the same as the generated code.
- Kept: if a bought instrument has no holder left, the buyer pays and the firm's last price changes, but nobody is paid and the instrument is not re-linked.
- Kept: the trader strategy (value, momentum, random) is drawn but no rule uses it. The derived `firmPriceEarningsRatio` of an instrument is unfinished in the generated code and returns 0, and so here. `sharesOutstanding` is never changed.
- Because Clear Offers runs at the end of every period, the series `instrumentsAsk` is always 0 when sampled.
- The model has no space. Its networks are not drawn (the engine network view draws one scape of nodes); the views are time series, bars and a histogram of trader funds.
- The AMP `uniformAdditiveDistribution` act is read as the uniform draw `randomInRange` used in the generated code.
- No Java random sequence is reproduced; runs are deterministic per seed.
