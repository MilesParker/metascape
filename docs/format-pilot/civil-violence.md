# Format pilot: Civil Violence Model I

Epstein (2002) Model I, written as a format model
(`packages/models/src/brookings/civil-violence/CivilViolenceI.model.json`), run by `compileModel`, and
compared with the coded port (`cvModelI`). Runs 1 to 5 of the paper are run specs of the one model. The
catalogue entry is "Civil Violence: Model I (format)", beside the coded models. No methods are used and
`packages/spec` is not changed: the model is pure spec.

## What was expressed declaratively

All of Model I's behaviour is acts, as flows of agents with path context:

- **Build:** the number of citizens and cops is a chain of evaluates (sites, density, `floor`) into two `create`
  acts, and one `buildGrid` fills a 40 x 40 periodic Euclidean lattice with `site` cells for both agents.
- **Initialize:** hardship and risk aversion are `randomUnit` draws; each agent moves to a random `available` site.
- **Random walk:** one random `neighbor` site, then a `move`. A move onto a taken cell does nothing (D9), which is
  Ascape's "try one neighbour, stay if occupied" without a test for availability.
- **Grievance:** a `derive` act (hardship x (1 - legitimacy) x (1 - threshold)), read like an attribute.
- **Decide state:** the cops and the active citizens in view are two `all` selections with `within` (and, for the
  active, a state query), each flowing into a set that adds one. The arrest estimate
  `1 - exp(-k floor(cops / (active + 1)))` is a chain of eight evaluates (integer `div` truncates, as the paper's
  floor). One `greater` query and its `none` set the state.
- **Patrol:** the cop selects the `nearest` active citizen `within` its vision (three queries joined by `all`), then
  selects the citizen's cell with `here`, and on that flow sets the citizen jailed, draws its term, records its home
  coordinates, makes it `leave`, and moves the cop into the cell. Flow order does the sequencing: the cell is bound
  before the citizen leaves, and the move comes after.
- **Release:** serve the term (`decrement`, set), then when over: select the home cell with `location2D`, then the
  `available` cell that is `nearest` to it with `includeSelf`, and `move` there. This is the coded "nearest free site to
  the old home".
- **Runs:** Run 1 (legitimacy 0.89, citizens do not walk), Run 2 (vision 7, legitimacy 0.82, jail term 30), Runs 3 to 5
  base (vision 7, 7.4% cops, never released, legitimacy 0.90) and Runs 3, 4 and 5 on top of it (`incorporates`) are
  six run specs of one model. Studio offers them as the model's runs.
- **Curation:** a Population Chart (counts of active, quiescent and jailed citizens), as the coded model's.

## Gaps, and how each was handled

| Gap                                                                                                                                                                                                                              | Handling                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A jailed citizen has to remember where it was arrested. Attributes cannot hold a cell.                                                                                                                                           | Store its coordinates. `locationX` and `locationY` (core library functions added by the Sugarscape pilot, commit `9051c26`, which I use but did not write) read the cell's position; `location2D` finds it again. Without them, release at a random site shifts the numbers by 10% (active 262 against 239, jailed 201 against 220 in the coded port itself), so this one mattered. **Format addition: none of mine.**                                           |
| Runs 3, 4 and 5 change legitimacy or the cop density as a run goes (every third period, once at 75, every period). A run spec only sets values at the start.                                                                     | Model parameters that are inert by default and a root `rule` that acts on them: `legitimacyErosion`, `erosionInterval`, `legitimacyCutPeriod`, `legitimacyCut`, `copDensityStep`. Five parameters exist only for these runs; a run spec that could schedule a change ("at period 75, set legitimacy") would be the cleaner form. **Approximation of the structure, exact in behaviour** (tested: legitimacy falls 0.01 on ten of 30 periods; cut to 0.65 at 75). |
| The coded model keeps the cop count equal to a target by killing random cops or adding cops (`scapeIterated`). Needed by Run 5 only.                                                                                             | Each cop draws a fixed `rank` in [0,1) and is withdrawn (`die`) when `rank x initial density` is at or above the density now. The count is binomial about the target, not equal to it. The start is the 6% target directly; the coded run shows 7.4% for one period first. **Approximation**, visible only in Run 5.                                                                                                                                             |
| Curation cannot chart a ratio, a mean over a qualified subset (non-jailed), a product (Tension), or a scaled series (Legitimacy x 1000, Cop Density x 10000). Only counts can be qualified; means are over the whole population. | The Population Chart is complete. The Measures Chart has two of its six series (mean grievance, mean risk aversion); the non-jailed means, Quiescent Ratio and Tension are missing, and the Run 3 to 5 charts lack their legitimacy and cop density lines. They could be root attributes computed by flows over all citizens (about 15 acts); not done. **Not expressed.**                                                                                       |
| The grievance grid view (cell colour by grievance) and the legend text.                                                                                                                                                          | Styles colour by state only (blue, red, black circles). **Not expressed.**                                                                                                                                                                                                                                                                                                                                                                                       |
| The interpreter keeps a root attribute that a `set` changes apart from `root.parameters`, so Studio's parameter display would not follow legitimacy as it changes in Runs 3 and 4.                                               | Not worked around; tests read the legitimacy off mean grievance, which is proportional to it. Worth a look by whoever owns the interpreter.                                                                                                                                                                                                                                                                                                                      |
| The coded model throws if the densities exceed 1, and vision is strict (`<`) for the nearest and inclusive for counting. `within` is inclusive in both.                                                                          | Not carried over. Differences only matter for a vision that equals a lattice distance exactly (7, say).                                                                                                                                                                                                                                                                                                                                                          |
| `fromMetaabm` (in `amp/metaabm.ts`) is used as it is, though this model is not from MetaABM.                                                                                                                                     | Used as is, to keep the change tiny. A rename to something like `fromFormat` would be the thing to do before more families use it.                                                                                                                                                                                                                                                                                                                               |

Parameters are named as the format names them (`lattice.width`, `lattice.height`) instead of `width` and `height`.

## Size

|                                                                     | lines | bytes                    |
| ------------------------------------------------------------------- | ----: | ------------------------ |
| `CivilViolenceI.model.json`                                         | 1,389 | 34,752 (19,473 minified) |
| `model-i-format.ts` (wiring, run specs, curation)                   |    69 | 2,800                    |
| Coded Model I: `model-i.ts` + `core.ts` + `agents.ts` + `vision.ts` | 1,197 | 40,000                   |

The coded files also serve Model II (groups, fission, death, attacks, and the recorded legitimacies), so the
Model I part of the coded port is smaller; I did not separate it out. The format model has 131 acts and about as many bytes
as the coded port, in more lines. I wrote it with a throwaway script that generates the JSON (helpers for the
repeated "random neighbour" and "random free site" flows), which is not kept; a model written by hand in JSON would be
longer and more error-prone.

## Statistical comparison

`model-i-format.test.ts` runs both over 12 seeds, 80 periods, on a 20 x 20 lattice (same densities), and compares
the mean over periods 30 to 80 of each seed. Means must differ by under four standard errors of the difference
(sampling noise of 12 seeds each) and under 2% of the population, and the spreads between seeds must be within
a ratio of 0.4 to 2.5. Result (coded against format; standard error of the difference):

| statistic | coded | format |  SE | spread between seeds (sd) |
| --------- | ----: | -----: | --: | ------------------------- |
| active    |  60.2 |   59.9 | 1.8 | 4.9 against 4.0           |
| jailed    |  57.6 |   57.6 | 2.1 | 6.1 against 3.6           |
| quiescent | 162.1 |  162.5 | 3.5 | 9.7 against 7.0           |

The test takes about 2.8 s (the file about 6 s). Larger checks, run once and not kept:

- 40 x 40, 30 seeds, 150 periods, last 100: active 236.9 against 238.4, jailed 220.1 against 220.7, quiescent 662.9
  against 660.9; sd between seeds 9.4 / 8.8 / 16.4 against 9.4 / 9.8 / 17.9.
- Runs 1, 3, 4 and 5 on 40 x 40, 4 seeds, 120 periods: Run 1 calm in both; Run 3 jailed 115.1 against 116.4;
  Run 4 jailed 691.8 against 689.9, active 7.5 against 4.4; Run 5 jailed 492.0 against 475.8, active 12.0 against 13.0,
  cops to zero in both.
- Run 2 (punctuated outbursts), 25 x 25, 24 seeds, 150 periods: active 1.9 against 2.2 (sd 2.7 / 2.4), jailed
  17.1 against 20.4 (sd 15.3 / 16.0), peak active 45 against 54. The outbursts are there.

Runs are deterministic per seed (tested); they do not reproduce the coded port's draws.

## Timing

Milliseconds per period after 10 warm-up periods, default parameters (40 x 40, 1,120 citizens, 64 cops), one seed,
on a loaded machine, not a test:

| version | ms per period |
| ------- | ------------: |
| coded   |           1.0 |
| format  |  15.7 to 16.2 |

About 16 times slower. With vision 7 the ratio is lower, because the search dominates both: Run 2 about 11 against 49
(4.5 times), Runs 3 to 5 about 8 to 11.5 against 28 to 50.

## Time taken

About an hour and a half of work. Roughly half went to learning the format's selection semantics from the docs and
the interpreter source (regions, spatial terms, how a query after a select behaves, where `within` needs a
fixed radius); about a quarter to writing and debugging the model (one name clash, no logic errors the first time);
the rest to the comparison, the extra runs and this report. The first version ran at the first try; finding that the
release site mattered, from the 10% difference, took one experiment.

## What this suggests for the remaining Brookings models

- **The idioms are now known and mechanical:** counting agents in view (about 6 acts), a nearest-of-a-kind search, a
  move with a binding that survives a `leave`, a formula as an evaluate chain. A second model of a family should cost
  well under half of this one. The expensive part was reading the interpreter to learn the selection rules; this
  document and `Heatbugs` plus `Schelling` are enough for the next person.
- **Where the format falls short, it was in what surrounds the behaviour:** (1) curation measures (ratios, qualified
  means, scaled series), (2) changes to parameters scheduled in a run, (3) holding a count of agents at a target, (4)
  the cell colour by a value. Models with several derived charts will hit (1) first, and need either root attributes
  computed by flows or a richer measure.
- **Parameter variants collapsed:** three of the six run specs are plain values; Runs 3 to 5 needed the model parameters
  above. Civil Violence II's four runs are all plain values (`model-ii.ts`: legitimacy and cop density), and its
  retaliation variant is one different decision rule, so a boolean parameter would do.
- **Model II needs more than I did:** a clone with inherited attributes (`create` in a flow, fission), death, an attack
  on the nearest other-group citizen that moves the attacker and counts kills per period (a reset after the sample),
  and distrust and legitimacy series computed from the counts. I would expect about twice this effort, with
  the counts and the data as the cost.
- **Speed is a risk:** 16 times slower on the default and about 4.5 times with a larger vision. At about 16 ms a period
  for 1,100 agents, models with many more agents or long searches will feel it in Studio; I did not profile the
  interpreter, so I do not know how much of that is easy to win back.
- **The statistical test is cheap to write:** one helper that takes the series names of each version. The coded port's
  between-seed spread matched the format model's, which is the better evidence of equivalence than the means.

## Checks

On my files: `prettier --check .` passes for the whole repo, `eslint .` passes, `tsc` passes for models, react and
studio, and the Civil Violence tests pass (66). The full `npm run check` does not go green here, for reasons outside
this family: `@xmldom/xmldom` is not installed, so `tsc -p packages/spec` and three `packages/spec/src/metaabm` test files fail;
the Studio catalogue manifest test fails until `UPDATE_CATALOG=1` regenerates `apps/studio/src/catalog/manifest.json`
and its pictures, which has to wait until the three pilots' models are all in (it would otherwise be rewritten by each);
and three tests time out at five seconds under load (Sugarscape's format test among them, and two in `packages/spec`).
