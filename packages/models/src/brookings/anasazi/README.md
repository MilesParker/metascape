# Artificial Anasazi (Long House Valley)

Family id `brookings-anasazi`, collection "Brookings Institution models (from Ascape)".

The Artificial Anasazi project tested Sugarscape-style agent-based modelling against a real
case: the Kayenta Anasazi of Long House Valley in north-eastern Arizona. Households farm maize
on an 80 x 120 lattice of 93.5 m cells; yields follow the reconstructed climate (adjusted Palmer
Drought Severity Index) and hydrology of each environment zone year by year; households settle
near water, store maize for two years, fission, and leave the valley when they cannot find land.
The simulated number of households is recorded beside the number in the archaeological
(SARG) settlement record, which grows to a peak of 216 households in AD 1269 and is empty from
AD 1300.

These are ports of the Java (Ascape 5.6.1) implementation by Miles Parker at the Brookings
Institution, itself a port of a C++ model by Steven McCarroll and Miles Parker
(`AboutLHV.html`).

- **Authors (model):** Robert L. Axtell, Joshua M. Epstein, Jeffrey S. Dean, George J. Gumerman,
  Alan C. Swedlund and colleagues.
- **Citation:** Axtell, R. L., Epstein, J. M., Dean, J. S., Gumerman, G. J., Swedlund, A. C.,
  Harburger, J., Chakravarty, S., Hammond, R., Parker, J., & Parker, M. (2002). Population growth
  and collapse in a multiagent model of the Kayenta Anasazi in Long House Valley. PNAS, 99(suppl.
  3), 7275-7279.
- `AboutLHV.html` also cites Dean, Gumerman, Epstein, Axtell, Swedlund, Parker and McCarroll,
  _Understanding Anasazi Culture Change Through Agent-Based Modeling_, in _Dynamics in Human and
  Primate Societies_, Oxford University Press, 2000.
- **Legacy copyright:** Copyright 1998-2007 The Brookings Institution, with revisions by
  Metascape LLC, and others (BSD, `LICENSES/brookings-models-license.txt`). All 25 legacy files
  carry this header and no other notice.

## Models

| Model (export)    | Legacy class                   | What it is                                                                           |
| ----------------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| `lhv`             | `edu.brook.aa.LHV`             | The base model: aggregate households of five, AD 800-1350.                           |
| `lhvGreedy`       | `edu.brook.aa.LHVGreedy`       | "Very preliminary exploration": greedy households whose extra code is commented out. |
| `lhvDisaggregate` | `edu.brook.aa.LHVDisaggregate` | "Very preliminary exploration": households made of individual people.                |
| `lhvClan`         | `edu.brook.aa.LHVClan`         | `LHVDisaggregate` run to AD 1400 with clan series and colours.                       |

Each step is one year; tick 0 is the start year (800 by default) and the run stops at the stop
year (1350; 1400 for `lhvClan`), as the legacy StartPeriod and StopPeriod did.

Recorded series: `year`, `households`, `historicHouseholds` (legacy "Sum Historic Households"),
`difference` (simulated minus historic, the quantity of `LHVRMS`), `settlements`,
`historicSettlements` (extant historic sites), `farmsPerHousehold.mean|max`, and per-year event
counts `movements`, `fissions`, `departures`, plus `deathsStarvation`, `deathsOldAge` (aggregate
models) or `people`, `householdSize.*`, `births`, `deaths`, `householdsFormed`,
`householdsDisbanded` and `clan0`..`clan5` (disaggregated models).

Views: "Long House Valley: simulation" (environment zones in the legacy zone colours, off-map
light grey, farms yellow, current water sources blue, simulated settlements as circles coloured
by the legacy tier: black under 5 households, green under 20, red otherwise; in `lhvClan` farms
take their clan's colour); "Long House Valley: history" (the legacy default hydrology fill, white
to blue, with farms, water and the extant historic settlements in the same tiers); and the chart
"Households: simulated and historical" (the legacy chart of Sum Historic Households and Count
Households).

### Calibration harnesses

`LHVRMS` and `LHVTest` are not models: both run `LHV` without graphics under an Ascape
`SweepControlView` and write run statistics to a file (`TestRMSFinal.txt`, `TestRMS.txt`). They
are expressed as experiment designs for `experimentRuns(lhv, design)`:

- `lhvRmsExperiment` (`LHVRMS`): four linked sweeps, crossed: fertility age (13,19) .. (16,16);
  fertility end age (26,34) .. (30,30); fertility (0.09,0.16) .. (0.125,0.125) in steps of 0.0025;
  death age (26,34) .. (30,30); 1500 points x 3 replicates. Each run reports the minimum, maximum
  and average of `difference` and its root mean square; as in the legacy harness a run is stopped
  if, before AD 1000, the simulation exceeds the record by more than 300 households.
- `lhvTestExperiment` (`LHVTest`): the same sweep, 5 replicates. The legacy harness dumped every
  statistic per year; here each run reports final `households`, `historicHouseholds`,
  `historicSettlements` (its misnamed "Difference Squared" collector was the count of extant
  historic settlements) and the difference summary.

`LHVMultiple` only adds a `DataOutputView` (file export) to `LHV`, with its sweep commented out.
It is not ported: the model is identical to `lhv`, whose recorded series (`sim.data.toCSV()`)
replace the export.

## Legacy classes

| Legacy class (edu.brook.aa)               | New model or shared file                | Status                                     |
| ----------------------------------------- | --------------------------------------- | ------------------------------------------ |
| `LHV` (with `GeneralValleyStreamSource`)  | `lhv.ts` `lhv`; `build.ts`, `valley.ts` | ported                                     |
| `LHVGreedy`                               | `lhv.ts` `lhvGreedy`                    | ported                                     |
| `LHVDisaggregate`                         | `lhv-disaggregate.ts` `lhvDisaggregate` | ported                                     |
| `LHVClan`                                 | `lhv-disaggregate.ts` `lhvClan`         | ported                                     |
| `LHVRMS`                                  | `experiments.ts` `lhvRmsExperiment`     | ported (as an experiment design)           |
| `LHVTest`                                 | `experiments.ts` `lhvTestExperiment`    | ported (as an experiment design)           |
| `LHVMultiple`                             | (none)                                  | not ported: data-export harness for `LHV`  |
| `HouseholdBase`                           | `households.ts`                         | folded into shared code                    |
| `HouseholdAggregate`                      | `households.ts`                         | folded into shared code                    |
| `HouseholdGreedy`                         | `households.ts`                         | folded into shared code                    |
| `HouseholdDisaggregate` (with `ClanStat`) | `households.ts`, `build.ts`             | folded into shared code                    |
| `Person`                                  | `households.ts` `Person`                | folded into shared code                    |
| `PersonClan`                              | `households.ts` `Person`                | folded into shared code                    |
| `FindMateRule`                            | `households.ts`                         | folded into shared code (unreachable path) |
| `ClanFindMateRule`                        | `households.ts` `Person.isEligibleMate` | folded into shared code                    |
| `Location`                                | `valley.ts`, `data/decode.ts`           | folded into shared code                    |
| `EnvironmentZone`                         | `valley.ts`                             | folded into shared code                    |
| `MaizeZone`                               | `valley.ts` `MaizeKind`                 | folded into shared code                    |
| `YieldZone` (with `Locations`)            | `valley.ts`                             | folded into shared code                    |
| `WaterSource`                             | `valley.ts`, `data/decode.ts`           | folded into shared code                    |
| `HistoricSettlement`                      | `valley.ts`, `data/decode.ts`           | folded into shared code                    |
| `Settlement`                              | `valley.ts`                             | folded into shared code                    |
| `Farm`                                    | `valley.ts`                             | folded into shared code                    |
| `Clan`                                    | `valley.ts`                             | folded into shared code                    |
| `LocationRanking`                         | (none)                                  | not ported: empty class, never used        |

## The data

The models are driven by the Long House Valley data files distributed with Ascape 5.6.1, in
`org.ascape.models.brook/res/edu/brook/aa/MapData`. They are embedded unchanged, byte for byte,
as base64 in `data/long-house-valley-data.ts`, generated by `data/convert.mjs` (run it with Node
from the root of the aiscape checkout; it checks each file's size and prints its SHA-256).
`data/decode.ts` decodes them exactly as the Java read them with `java.io.DataInputStream`:
big-endian signed 16-bit shorts and big-endian 32-bit IEEE floats. `data/decode.test.ts` checks
the decoded values against facts in the Java (dimensions, record counts, value ranges, the site
2307 correction, the zone copies) and the test of the model checks the historic household
series (14 households in 800, 216 at the 1269 peak, none from 1300).

| File               | Bytes | SHA-256 (prefix) | Layout                                                                                                                                                                                                                                                                                                                              |
| ------------------ | ----- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `map.bin`          | 19200 | `5c8c2425`       | 80 x 120 shorts, x outer, y inner. Value `10 * zone + d`: zone 0 general valley floor, 1 north valley floor, 2 mid-valley floor, 3 uplands natural, 4 uplands arable, 5 Kinbiko Canyon, 6 off the map (4966 cells); `d >= 5` marks sand dunes (north and mid-valley only).                                                          |
| `water.bin`        | 1296  | `ce661ae0`       | 108 records of 6 shorts: number, metres north, metres east, type, start date, end date. Type 2 is permanent, type 3 a reservoir extant between the dates; types 1 (56 records) and 4 (2) are never extant in the model. Two records fall off the lattice and are ignored.                                                           |
| `settlements.bin`  | 11712 | `7076df1b`       | 488 records of 12 shorts: SARG site number, metres north, metres east, start date, end date, median date as years before 1950, type, size, description, room count, elevation, baseline households. Only type 1 (habitation, 235 records, 234 on the lattice) is used. Site 2307's median date is corrected to 1075 as in the Java. |
| `environment.bin`  | 74360 | `6b042727`       | For each year 200..1499, for zones 0..4: a PDSI float (only from year 382), a hydrology float (0..10) and an aggradation float. Kinbiko Canyon (zone 5) copies the north valley (zone 1).                                                                                                                                           |
| `adjustedPDSI.bin` | 20800 | `9dcc5976`       | Adjusted PDSI floats, zone 0..3 in turn, each for years 200..1499. Uplands arable (zone 4) copies uplands natural (zone 3); Kinbiko copies the north valley.                                                                                                                                                                        |
| `PDSI Data`        | 31815 | (not embedded)   | A CR-terminated text listing (`year/zone: value value`, years 1062..1350). No Java class reads it, so it is not embedded.                                                                                                                                                                                                           |

Surveyed metres map to cells as in `Location.getCoordinateFromMeters`: anchored on site 2115
(2392 m east, 7954 m north) at cell (24.5, 37.6), 93.5 m per cell, with Java float arithmetic.

**Licence of the data.** These are the Long House Valley data files distributed with Ascape
5.6.1. No separate licence statement for the data was found, in the data directory, the `About`
text or the package. The package's `res/edu/IMPORTANT README.txt` says only that the code in the
`edu` directory "is not clearly licensed to Bios" (another project) and should not be copied into
Bios projects; it says nothing about the data and does not apply to Metascape.

## Deviations from the legacy behaviour

- Random numbers come from the engine's seeded streams (one per scape), so runs do not reproduce
  Java's sequence. `java-random.ts` reimplements Java's `nextGaussian` (polar method),
  Ascape's inclusive `randomInRange` and Java's `(int)` cast. Where Ascape shuffled a rank and
  took the first match, or scanned people in random order and kept the last eligible mate, the
  port draws uniformly among the matches, which has the same distribution.
- The engine has no hierarchy of scapes. The environment and yield zone rules run first each
  year from an `environment` scape; then the households, then (disaggregated models) the people,
  in the legacy order. Households and people act agent by agent in a fresh random order, as
  Ascape's default agent-order execution did. The legacy initial rules (set the start year's
  environment, then Force Move each household in random order; in the disaggregated models Force
  Move, Force Move, Create Scape per household) run in a `sim.setup` callback.
- The yield-zone farmland lists are kept sorted on insertion instead of being re-sorted lazily;
  the resulting order is the same as the legacy stable sort. The nearest-water search caches,
  per year, the rank of the nearest water for each cell (the random choice within the rank is
  still made on every call); this only saves time.
- Settlements are occupants of the valley grid, and a `historic sites` scape marks cells with
  historic settlements, so views can draw them.
- Legacy statistics not ported: "Households in <zone>", "Farms in <zone>" (the latter always 0
  in the Java), settlement size bands, per-person household size bands, "Historic Household Size".
- Views: farms and water are cell colours, not a hatch and an oval drawn over the fill. The
  "Plot Yield", "Zone Yield", "APDSI", "Maize Zone", "Yield Zone" and "Sand Dunes" fills are not
  offered. In the legacy draw features the labels of "Simulation Settlement Tier" and "Historical
  Settlement Tier" are swapped, so the legacy view named "Simulation" drew the historic
  settlements and "History" the simulated ones; the port draws simulated settlements in the
  simulation view. The legacy `LHVClan.createViews` dereferences the never-assigned `view` field
  (a NullPointerException); the port colours farmland by clan instead of outlining cells.
- `Location.isAvailable` is named `isFree`, to keep the engine's `Cell.isAvailable`.

## Legacy behaviour kept (apparent bugs and oddities)

- **Default parameters overshoot the record.** With the legacy defaults (harvest adjustment 1.0,
  need 800 kg) the simulation grows to about 1060 households by AD 1050, against at most 216 in
  the record, and falls to about 300 by 1350 without reaching zero. The test checks the
  qualitative pattern only: growth with the record from 14 households in 800, a peak between
  1000 and 1270, and a decline after 1250 to under half the peak by 1350. At a harvest
  adjustment of 0.7 or less the population dies out within a few decades; at 0.8 to 0.9 it peaks
  at 550 to 930 households and falls to between 15 and 120 by 1350. The
  calibrated values of the published runs are not in the legacy sources.
- `findFarmAndSettlement` returns early when the valley has no productive land left, without
  making the locations it had already passed over available again, so they drop out of the
  farmland lists for the rest of the run.
- After a failed nutrition check a farm location is made available twice (once when the farm is
  left, once as a searched location), so it can appear twice in its zone's list.
- A settlement site must itself have low erosion: `hasWithin(LOW_EROSION, true, 1.0)` searches
  ranks strictly closer than 1.0, which is the cell itself.
- Aggregate households harvest only their first farm (one adult) and need one farm whose base
  yield covers their need. Harvests and estimates are truncated to integers as they are summed.
- The oldest year's maize (the "holding" slot) is eaten first but is not counted in the stocks.
- `harvestVarianceYear` is a parameter but is never used; frost years are defined but commented
  out. `typicalHouseholdSize` and `baseNutritionNeed` set the default household need (5 x 160)
  only once; changing them does not change an aggregate household's need.
- `HouseholdGreedy`'s buffer farms are commented out, so `lhvGreedy` behaves like `lhv`.
- Disaggregated models: replacing the household prototype re-adds the base rules, so households
  run metabolism (harvest) and movement twice a year and Force Move twice at start-up, before
  their members exist (need 0). Household maize is harvested but never eaten (the consumption
  line is commented out), so nobody starves; households can work up to six farms whatever their
  size; household fertility parameters are drawn but unused, so `minFertility` (0.25, or 0.33
  in `lhvClan`) has no effect.
- Every person is a `PersonClan`, even in `LHVDisaggregate`, so men must come from another clan
  and household. A woman who marries does not become head of household (her mate is set
  directly), so widows may remarry; founding mothers may not.
- Age is incremented before the death check, so the infant mortality bracket (age under 1) is
  never used; everyone dies at 45.
- A newly married couple whose household finds no land dies with it.
- Locations take a clan only from farms; the settlement path that would set one is unreachable.
- Water source types 1 and 4 are never extant; where two water records fall on one cell the later
  one replaces the earlier.

## Engine gaps

- No normal deviate in the engine's `Random`: `java-random.ts` adds `gaussian` (with a per-stream
  spare, as Java does), plus inclusive-range and `(int)` cast helpers.
- No rank-ordered Euclidean nearest search with Ascape's semantics (strictly-less distance,
  random choice within the nearest rank, full-scan fallback beyond 135): `valley.ts`
  `LongHouseValley.findNearest`, `hasWithin` and `findMaximumWithin`.
