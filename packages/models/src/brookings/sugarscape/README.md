# Sugarscape (Brookings Institution models, from Ascape)

A port of the Ascape 5.6.1 package `edu.brook.sugarscape`: the Sugarscape
models of _Growing Artificial Societies_. Each runnable legacy class is its own
Metascape model, built from shared code that mirrors the legacy class hierarchy
(`GAS_Base` → `GAS_II_1` → `GAS_II_2` → …, `GAS_SexBase`, `GAS_SpiceBase`, the
cell and agent hierarchies and the rule classes).

- Model: Joshua M. Epstein and Robert Axtell.
- Citation: Epstein, J. M., & Axtell, R. (1996). _Growing Artificial Societies:
  Social Science from the Bottom Up._ Brookings Institution Press and MIT Press.
- Legacy implementation: chapters II and III by Miles Parker, chapter IV by Alan
  Lockard (per the `About*.html` files), The Brookings Institution.
  Copyright 1998-2007 The Brookings Institution, with revisions by Metascape
  LLC, and others; BSD license (`LICENSES/brookings-models-license.txt`). Every
  legacy file carries that header; none has another notice.
- `ascape-space.ts` reproduces bits of Ascape framework behaviour (`org.ascape.*`,
  `LICENSES/ascape-license.txt`) that the models depend on.

The `About*.html` files only cite the book, so model names and descriptions
come from the source comments and the book's chapter structure.

## Files

| File                | Contents                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `world.ts`          | Settings (the root's bean properties), the "root" object agents reach, `CommoditySource`/`Stock`         |
| `cells.ts`          | `SugarCell`, `SpiceCell`, `PollutableSugarCell`, the capacity map, growback/seasonal/diffusion rules     |
| `agents.ts`         | `SugarAgent` … `SexualSpiceAgent`, the movement/harvest/metabolism/death/play rules                      |
| `exchange.ts`       | `Exchange`, `Exchange2`                                                                                  |
| `trade.ts`          | `TradeT`, `TradeT2`, `TradeT3`, `TradeT4`                                                                |
| `reproduction.ts`   | `PromiscuousReprod`, `CulturalReproduction`, `PromiscuousSpiceReprod`                                    |
| `social-network.ts` | `TrackSocialNetwork`                                                                                     |
| `base.ts`           | `GAS_Base`, `GAS_SexBase`, `GAS_SpiceBase` builders, parameters, view helpers                            |
| `chapter-2.ts`      | `GAS_II_1/2/3/5/6/7/8`, `Spice_II_1/2`                                                                   |
| `chapter-3.ts`      | `GAS_III_2/3/6` and `GAS_II_4` (which extends `GAS_III_2`)                                               |
| `chapter-4.ts`      | `GAS_IV_1`, `GAS_IV_a` … `GAS_IV_i`                                                                      |
| `batch.ts`          | The `Multiple*` batch harnesses as experiment designs                                                    |
| `ascape-space.ts`   | Ascape semantics: line-of-sight order, `findMaximum` ties, random free cell, `uniqueSeries`, `Diffusion` |

## Legacy classes

| Legacy class                                                                                                                    | New model or shared file                                         | Status                                                    |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------- |
| `GAS_Base`                                                                                                                      | `base.ts` (`createGasBase`, `sugarParameters`, `gasBaseViews`)   | folded into shared code                                   |
| `GAS_SexBase`                                                                                                                   | `base.ts` (`createGasSexBase`)                                   | folded into shared code                                   |
| `GAS_SpiceBase`                                                                                                                 | `base.ts` (`createGasSpiceBase`, `spiceParameters`)              | folded into shared code                                   |
| `GAS_II_1`                                                                                                                      | `gasII1` "Sugarscape II-1: Immediate growback"                   | ported                                                    |
| `GAS_II_2`                                                                                                                      | `gasII2` "Sugarscape II-2: Unit growback"                        | ported                                                    |
| `GAS_II_3`                                                                                                                      | `gasII3` "Sugarscape II-3: Carrying capacity"                    | ported                                                    |
| `GAS_II_4`                                                                                                                      | `gasII4` "Sugarscape II-4: Wealth deciles"                       | ported                                                    |
| `GAS_II_5`                                                                                                                      | `gasII5` "Sugarscape II-5: Neighbor networks"                    | ported                                                    |
| `GAS_II_6`                                                                                                                      | `gasII6` "Sugarscape II-6: Migration from a corner"              | ported                                                    |
| `GAS_II_7`                                                                                                                      | `gasII7` "Sugarscape II-7: Seasons"                              | ported                                                    |
| `GAS_II_8`                                                                                                                      | `gasII8` "Sugarscape II-8: Pollution"                            | ported                                                    |
| `Spice_II_1`                                                                                                                    | `spiceII1` "Sugarscape Spice II-1: …, immediate growback"        | ported                                                    |
| `Spice_II_2`                                                                                                                    | `spiceII2` "Sugarscape Spice II-2: …, unit growback"             | ported                                                    |
| `GAS_III_2`                                                                                                                     | `gasIII2` "Sugarscape III-2: Sexual reproduction and vision"     | ported                                                    |
| `GAS_III_3`                                                                                                                     | `gasIII3` "Sugarscape III-3: Sexual reproduction and metabolism" | ported                                                    |
| `GAS_III_6` (with `CulturalReproduction`)                                                                                       | `gasIII6` "Sugarscape III-6: Cultural transmission"              | ported                                                    |
| `GAS_IV_1`                                                                                                                      | `gasIV1` "Sugarscape IV-1: Sugar and spice, no trade"            | ported                                                    |
| `GAS_IV_a` … `GAS_IV_i`                                                                                                         | `gasIVa` … `gasIVi`                                              | ported                                                    |
| `SugarCell`, `SpiceCell`, `PollutableSugarCell`                                                                                 | `cells.ts`                                                       | folded into shared code                                   |
| `CommoditySource`, `CommodityStock`                                                                                             | `world.ts`                                                       | folded into shared code                                   |
| `SugarSeasonalGrowBackRule`                                                                                                     | `cells.ts` (`sugarSeasonalGrowBackRule`)                         | folded into shared code                                   |
| `SugarAgent`, `PollutingSugarAgent`, `SexualAgent`, `CulturalSexualAgent`, `SpiceAgent`, `NegotiatingAgent`, `SexualSpiceAgent` | `agents.ts`                                                      | folded into shared code                                   |
| `PromiscuousReprod`, `PromiscuousSpiceReprod`                                                                                   | `reproduction.ts`                                                | folded into shared code                                   |
| `Exchange`, `Exchange2`                                                                                                         | `exchange.ts`                                                    | folded into shared code                                   |
| `TradeT`, `TradeT2`, `TradeT3`, `TradeT4`                                                                                       | `trade.ts`                                                       | folded into shared code                                   |
| `TrackSocialNetwork`                                                                                                            | `social-network.ts` (a rule used by `gasII5`, not a model)       | folded into shared code                                   |
| `MultipleGAS_II_2`, `MultipleGAS_IV_a` … `MultipleGAS_IV_i`                                                                     | `batch.ts` (`multipleGasII2` …, `sugarscapeBatches`)             | ported as experiment designs (batch harness, not a model) |

### The `Multiple*` classes

Each `Multiple*` class subclasses a model, replaces all its views with a
`DataOutputView` (every statistic of every period written to a file under
`C:\ResultData`) and sets a stop period: 100 for `MultipleGAS_II_2`,
`_IV_c` … `_IV_i`, 1000 for `_IV_a`, 2000 for `_IV_b`. They are batch harnesses,
not models, so they are not in the family. `batch.ts` expresses each as
`{ legacyClass, model, design }` for `runExperiment(model, design)`
(`packages/engine/src/run/experiment.ts`): one run to the stop period, whose row
holds the final value of every recorded series. The per-period file is not
reproduced; use `sim.data.toCSV()` in a `setup` hook for that.

## Behaviour carried over from Ascape

- Agents scapes run in Ascape's default `AGENT_ORDER`: a fresh random order each
  tick, each agent runs all its rules; dead agents are skipped and newborns
  first act next tick (engine `byAgent`, `shuffled`). Cell scapes run in
  `RULE_ORDER`. The cells scape steps before the agents.
- Vision is Ascape's von Neumann "line of sight" on a periodic 50 x 50 lattice.
  `SugarAgent.movement` takes the cell of greatest value among its own cell and
  those it sees, occupied or not, at random among ties (Ascape `findMaximum`,
  equality within 1e-10), and moves only if that cell is free: an agent whose
  best cell is occupied stays put.
- Placement uses `findRandomUnoccupiedCell`: ten random tries, then a random
  free cell. II-6's corner placement (`MoveRandomWithin(0, 30, 20, 20)`) falls
  back, after ten failed tries in the corner, to a free cell anywhere on the
  lattice, so once the corner fills agents land elsewhere.
- `uniqueSeries` is reproduced exactly (lexicographic permutations, one draw).
- `Diffusion` replaces each cell's pollution with the mean of its four
  neighbors' (its own value is not included), in two phases.
- The capacity map is `SugarCell.initialize`'s formula with peaks at 0.8/0.2 and
  0.3/0.7 of the extent ((40, 10) and (15, 35)), `MAX_SUGAR` 4; spice peaks at
  (15, 10) and (40, 35), `MAX_SPICE` 5; Java `float` arithmetic is reproduced
  with `Math.fround`, including `Math.round(float)`.

## Kept legacy bugs and oddities

1. **Population always 400.** `GAS_Base.scapeSetup` sets the agent extent to 400
   at every setup, overriding the 300/350 that `GAS_SexBase`, `GAS_II_6`,
   `GAS_II_8`, `GAS_III_6`, etc. set in `createScape`. All models start with 400.
2. **`GAS_II_4` extends `GAS_III_2`**, so the "wealth deciles" model has sexual
   reproduction and death by old age.
3. **Children keep only the mate's endowment.** `PromiscuousReprod`,
   `CulturalReproduction` and `PromiscuousSpiceReprod` call `child.setSugar`
   (and `setSpice`) twice: the first parent's contribution is taken and lost.
4. **Children are initialized like newcomers**: random sex, fertility ages,
   death age, metabolism/vision not inherited, a random initial sugar (which
   becomes their fertility threshold), before the inherited values are set.
5. `SexualAgent`/`SexualSpiceAgent` declare initial sugar ranges (50-100,
   25-50) that nothing uses; the `GAS_Base` range 0-30 applies.
6. **`SpiceAgent.metabolism` ages agents twice per tick.** With death ages
   60-100 and fertility only while stocks are at least the random initial
   endowment, the IV-e … IV-i populations die out within about 60 ticks.
7. **Spice settings are forced.** `GAS_SpiceBase.initialize` sets sugar
   moundness 0.008, sugar metabolism 1-3 and vision 10 at every run, so these
   are not parameters of the spice models.
8. **`GAS_SpiceBase.setMaxInitialSugar` sets the maximum initial spice**; the
   maximum initial sugar stays 30. The parameter `maxInitialSugar` of the spice
   models keeps this.
9. **`Spice_II_1` uses `DEATH_STARVATION_RULE`**: agents die only for lack of sugar.
10. **`Spice_II_2` only installs sugar growback**, so spice never regrows.
11. **`GAS_IV_d` installs no growback rule** (its `createScape` does not call its
    superclass), and checks death before metabolism (as does `GAS_IV_e`).
12. **Trade rules visit neighbors in list order.** `TradeT`, `TradeT2` and
    `TradeT4` draw a random series but then use `neighbors.get(i)`.
13. **`Exchange2` with no price** computes holdings and gains from the
    one-unit `Exchange` quantities; the resized quantities only enter
    `tradeIsValid`. The executed trade is the one-unit one.
14. **`TradeT4` always asks the original neighbor to respond**, also after the
    roles have been swapped. `offerResponse` compares the current MRS with
    `offerList[iteration]`, which is always 0.
15. `SpiceAgent.calculateMRS()` tests `spice < 0` (not `<= 0`), so an agent with
    no spice has MRS 0, while `calculateMRS(sugar, spice)` gives 1/100000.
16. `GAS_II_7`'s summer test is `iteration / (2 * length)` minus its integer
    part `> 0.5`, and the halves are split at the fixed row 25.
17. `PollutableSugarCell.maxPollution` is shared by all cells (a Java static)
    and only used for colouring.
18. `GAS_III_6` agents never die of old age (only starvation, checked twice).

## Deviations

- **`TradeT3` with exactly one neighbor**: the legacy code casts the neighbor
  list to an agent and throws `ClassCastException`, which would end the run
  almost at once; the port trades with that one neighbor (`gasIVc`, `gasIVh`).
- **Arithmetic is double precision** (Java `float` in the agents and exchanges),
  except the capacity map and the season test, which use `Math.fround`. Trade
  sequences may therefore differ in their smallest trades.
- **`initialPopulation` parameter added** (default 400) so tests and users can
  run smaller populations; it is not a legacy property.
- **Age statistic**: `GAS_Base`'s "Age" collector records the negated age; the
  port records the age.
- **Statistics and charts**: stat collectors become `sim.data` series (`population`,
  `sugar`, `age`, `vision`, `sugarMetabolism`; spice models `sugar`, `spice`,
  `mrs`, `cellSugar`, `cellSpice` with variance). Pie charts become bar charts.
  Models whose legacy class had no chart get population and mean-trait charts.
  Trade models add `trades` (per tick) and `meanLogPrice`, which the legacy code
  had commented out. `gasII5` shows the neighbor network in a network view
  (Ascape drew it over the lattice) and records `networkLinks`; `gasIII6` counts
  `blue` and `red` agents; `gasII8` records `pollution`.
- **II-6's stop period 50** is built in (Ascape `setStopPeriod`); the `Multiple*`
  stop periods are the experiment designs' `maxTicks`.
- Vision colours for values above 6 (or metabolism above 4) would throw in the
  legacy views; the port shows them white.
- Java's random sequence is not reproduced; runs are deterministic per seed.

## Not verified

The port has not been compared run-for-run against Ascape (that is not
possible without matching random streams). Qualitative checks in the tests:
II-2 falls to a stable carrying capacity, II-6 starts in its corner and stops at
50, II-7 alternates growback by season, III-2 has births, IV-a/IV-c trade.
