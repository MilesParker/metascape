# Pilot: Sugarscape II-1, II-2 and II-3 as format models

Part of the estimate of what it takes to turn every coded model into a format model. The three
models are in `packages/models/src/brookings/sugarscape/` (`SugarscapeII1.model.json`,
`SugarscapeII2.model.json`, `SugarscapeII3.model.json`), wired in by `format.ts` with `fromMetaabm`
and shown in the family as "Sugarscape II-n: … (format)", each after its coded port. The comparison
tests are `format.test.ts`.

## Result

All three run in the catalogue and match the coded ports statistically (below). One addition to the
format was needed, in two parts (commit `9051c26`, with tests): the spatial term `lineOfSight`, and
the evaluates `locationX` and `locationY`. No method acts: the three models are pure spec.

Not finished: `npm run check` is not green, for two reasons outside the three models (see
[Check](#check)).

## What was expressed, and how

The coded port is a class hierarchy (`GAS_Base` → `GAS_II_1` → …). The format models are flat:

- **Parameters** are the root scape's ten attributes (the `GAS_Base` bean properties, with
  `min`/`max`) and the lattice's `width` and `height`.
- **Two agents**: `sugarAgent` (sugar, age, vision, metabolism, death age; the first four gathered)
  and `sugarCell` (sugar, capacity), the cell filling the 50 × 50 periodic von Neumann `lattice`.
  `execution: { order: 'agent' }` on the agent matches Ascape's `AGENT_ORDER`; the cells keep rule
  order and run before the agents, as in the port.
- **Build**: one `create` (`initialPopulation` agents) and one `buildGrid`.
- **Agent initialize**: place on a free cell (a select of cells with `available`, then a move: the
  same distribution as `findRandomUnoccupiedCell`), and one `randomInRange` evaluate plus a set for
  each of death age, age (drawn after, from `0..deathAge`), vision, metabolism and initial sugar.
- **Movement** is a flow of ten acts: a select of cells with the terms `lineOfSight(vision)`,
  `maximize(sugar)` and `includeSelf`, joined by an `all`, then a query `available` and a move.
  Like the port, it picks the best cell in sight whether occupied or not (ties at random,
  including its own cell) and moves only if that cell is free.
- **Harvest, metabolism, starvation** are three rules: a `here` select and two sets; two
  evaluates and two sets; a query `lesserorEqual(sugar, zero)` and a `die`.
- **The sugar landscape** (II-1 to II-3 share it) is a chain of 25 evaluates in the cell's
  `initialize` act: each cell reads its own position (`locationX`, `locationY`) and computes
  `floor(4 · min(1, Σ exp(−moundness · distance²)) + 0.5)` to two peaks placed at fractions of the
  lattice size. All 2,500 capacities equal the coded `capacityAt` (tested).
- **Growback** is the only thing that differs between II-1 and II-2: a cell rule that sets sugar
  to capacity (one set), or to `min(sugar + 1, capacity)` (two evaluates and a set).
- **Styles**: cells are black to yellow by sugar (`colorRGB`), agents red ovals.
- **Curation** (in `format.ts`): the population chart, and mean sugar, vision and metabolism, as in
  the coded charts (`sugarStatisticsCharts`).

**II-2 and II-3 are not new structure.** II-2 changes one rule of the cell (growback). II-3 is
II-2 with a different name and description: the legacy `GAS_II_3` only adds a population chart
that the coded `GAS_Base` charts already show. With a seed, the format II-3 is run for run
the same as II-2 (tested). In a run-spec world, II-3 is a second name for II-2.

## Gaps hit and how they were worked around

1. **Vision along the lattice directions (rule M).** `within` is a diamond on a von Neumann grid
   (Manhattan distance), but Sugarscape agents look along the four lattice lines. Added the spatial
   term `lineOfSight(distance)`: the engine's `Array2D.rays` (each direction of the grid's
   neighbourhood, with wrapping), origin only with `includeSelf`, in other spaces the same as
   `within`. In its own commit, with `line-of-sight.test.ts`.
2. **A cell's own position.** The capacity map needs each cell's coordinates, and nothing in the
   format gives them (`location2D` is a test, not a value). The obvious route, `distance` to a peak
   cell, wraps on a periodic grid and the landscape does not. Added the evaluates `locationX` and
   `locationY` (an agent's position in the selection's space), same commit.
3. **Real to integer.** No library function converts a real to an integer, and the checker (rightly)
   refuses a real where an integer is expected, so `floor(…)` cannot be stored in an integer
   attribute. Worked around by declaring `sugar` and `capacity` real. They hold whole numbers; a
   `toInteger` function (or integer results from `floor`, `ceil` and `rint`) would remove this.
4. **"Move only if the best cell is free."** The select's region would filter out occupied cells
   before choosing, which is not what the port (or Ascape) does. The query `available` is put after
   the `all`, where it filters the one cell already chosen (R18). This is what the format says, but
   the checker warns about it ("This query follows the logic act…"). The warning is the one
   diagnostic the models give. A second select (`here`, `available` from the chosen cell) avoids
   the warning, but `here` finds nothing when the origin is itself a cell unless `includeSelf` is
   added (`choose` in `flows.ts` skips a candidate that is the origin); not changed.
5. **Parameter groups and `live`.** The coded parameters carry Studio groups ("Landscape", "Agents at
   setup"); the format's attributes have none. The format parameters show ungrouped.
6. **Range checks.** The coded world throws when a minimum exceeds its maximum; `randomInRange` in
   the format returns the minimum.
7. **Lattice size.** The coded lattice is a constant 50 × 50. In the format the size is a
   parameter and the peaks scale with it, so a size slider would work (line of sight on a lattice
   smaller than 2 · vision + 1 wraps and is de-duplicated rather than throwing).
8. **Series names.** The format records `sugarAgent.count`, `sugarAgent.sugar.mean` and so on;
   the coded port records `population`, `sugar.mean`. Anything that reads series by name (the
   `Multiple*` batch designs) works on the coded models only.
9. **Name of `fromMetaabm`.** It is misleading here: there is no `.metaabm` original. I kept it as
   asked (it lived in `amp/metaabm.ts`, now `format-model.ts`, shared by the pilots); a rename such as `fromModel`
   is for whoever lands last.

Left as it was: Ascape's tie tolerance (1e-10) and Java `float` arithmetic (irrelevant to integers
and, at the landscape, equal on every cell); the legacy bugs listed in the README that concern
II-1 to II-3 (population always 400).

## Methods used

None.

## Sizes

|                                                 | Lines     | Bytes  |
| ----------------------------------------------- | --------- | ------ |
| `SugarscapeII1.model.json` (Prettier formatted) | 930       | 23,125 |
| `SugarscapeII2.model.json`                      | 955       | 23,670 |
| `SugarscapeII3.model.json`                      | 955       | 23,631 |
| `format.ts` (wiring, curation)                  | 66        |        |
| Coded port, the parts II-1 to II-3 use          | about 650 |        |

The coded figure is an estimate from reading: `chapter-2.ts` (II-1 to II-3, about 100 lines), the
sugar half of `base.ts` (parameters, scapes, views; about 200), `SugarAgent` and its rules (about
110), `SugarCell`, `capacityAt` and the growback rules (about 100), `world.ts` (about 100) and the
parts of `ascape-space.ts` the three use (about 100). The whole family is about 3,500 lines in 15 files, tests and README included.

The JSON is about 1.4 times as many lines as the TypeScript it replaces, since each act is five to
ten lines and the model has about 80 acts (agent 36, cell 30, root 3, styles 9). Minified it is 12.4 kB per model. The landscape alone is 25 of the
cell's 30 acts.

## Duplication

Counting lines that differ in a `diff` of the formatted files:

| Pair        | Lines in a diff                                                                | Of         |
| ----------- | ------------------------------------------------------------------------------ | ---------- |
| II-1 → II-2 | 41 (6 of them the `id`, `label` and `description`; the rest the growback rule) | 930 to 955 |
| II-2 → II-3 | 6 (`id`, `label`, `description`)                                               | 955        |
| II-1 → II-3 | 41                                                                             |            |

So 96% of II-2 is II-1, and II-3 is II-2 by 99.4%. A written-by-hand copy of the three files is
2,840 lines holding about 1,000 lines of information. In this pilot the files were emitted by a
throwaway script (not in the repository) from one description with a growback variant: that is
a reuse mechanism of a kind, and it made II-2 and II-3 take no time to write. Without it each
would be a copy-paste of 930 lines and an edit of 30.

## Ways to build one model on another

**Built since** (2026-11-18): option 1, as overlays resolved at load; see `packages/spec/README.md`
("Building one model on another") and `docs/roadmap.md`. II-2 is now a 54-line overlay of II-1 and
II-3 a 7-line overlay of II-2, and the resolved models are the old files byte for byte. The paths
are keys joined by dots (`agents.sugarCell.acts.growBack`), with `add`, `replace` and `remove`
sections (so that a misspelt path is an error), as the first option suggested. What follows is the
comparison as it was written, before the build. Not built: option 2.

None was built when this was written. How the originals did it: **Ascape** by Java subclassing (`GAS_II_2.createScape` calls
`super`, then `getRules().setSelected(rule, false)` and `addRule(...)`; `GAS_II_3` only overrides
`createViews`). **MetaABM** had no model inheritance at all: `SAgent` and `SContext` have no
`extends`; the only reuse is `library` (functions), `IModelExtension`, groups of acts (R5, whose
intent may have been this, but nothing defines it), and, for runs, APar's `incorporates`. The
Ascape chain therefore has no counterpart, and the pilot's II-2 and II-3 show what it costs.

1. **An overlay (`extends`).** A model file names a base model and holds only what it adds,
   replaces (by path: `agents.sugarCell.acts.growBack`) or removes (`null`, as the artifact tool
   does for files). The compiler applies it to the base before checking. II-2 would be about 40
   lines and II-3 about 6, close to the Java it came from, with `GAS_II_2.createScape` as `{ extends:
'sugarscapeII1', acts replaced }`. For the rest of the Sugarscape chain, an overlay can add whole
   agents, attributes and acts, and remove rules (the IV models install other rules); it cannot
   cleanly change a value deep in one act, so a step that tweaks one act's inputs replaces the act.
   Cost: one small deterministic merge in the compiler (about 100 lines and tests), checking
   after merging, and a decision on how an overlay's paths are written (R1's paths already name
   every element). Weakness: reading a model means reading its chain; the Studio editor would
   show the merged model.
2. **Shared definitions (composition).** Pieces (an agent, a group of acts, a space) live in a
   library file and models refer to them (`{ use: 'sugarscape/landscape' }`), which fits R5's
   unrealized idea of a reusable group of acts and fixes the reverse case of one piece used by many
   unrelated models (the landscape in all of II, IV; a Moore-neighbour vision). It does not
   express "II-2 is II-1 with another growback" without turning the growback into a slot a
   model fills, so it is more machinery for the chain case; models built on it have no ancestry,
   which is a loss for a family that is a chain.
3. **Variants in the model (a run spec chooses).** For steps that differ only by a rule
   switched on or off or a value (II-2 against II-1 is a different growback rule; III-2 against
   II-2 adds sex), one model holds the alternatives (a state attribute `growback: immediate |
unit`, rules guarded by it) and a run spec picks (R24: run specs already set attributes). It
   needs no new compiler feature beyond guarded acts, but it stuffs one model with the whole
   chain's behaviour and makes every step's model a settings choice, which is wrong for
   structurally different steps (II-5's network, IV's trade).

**Recommendation: 1, with 3 for what really is a parameter.** The chain is the shape of the
data (23 Sugarscape models, 21 Bionland steps), the Java it came from was an overlay, and an
overlay costs the least to write and to keep in step (a change to the base reaches every model
built on it). Keep composition (2) as a later, separate use of R5's groups, and use a run spec
(3) when a step is only settings, as II-3 is of II-2 (it is a name; an alias in the catalogue
would do). If an overlay is built, the catalogue's `fromMetaabm` should take the base as an
argument or the base should be named by the file, so that curation and provenance still sit in
the family's `index.ts`.

## Statistical comparison

Over seeds 1 to n, for the statistics of the coded charts (population, mean sugar, mean vision,
on default parameters), coded against format. Means ± standard deviation across seeds. The
last column is the difference of means in standard errors of the difference.

| Model | Period | n   | Statistic   | Coded       | Format       | Diff / SE |
| ----- | ------ | --- | ----------- | ----------- | ------------ | --------- |
| II-1  | 35     | 10  | population  | 315.0 ± 6.4 | 318.7 ± 5.4  | 1.40      |
|       |        |     | mean sugar  | 60.4 ± 2.0  | 59.9 ± 1.8   | −0.61     |
|       |        |     | mean vision | 3.75 ± 0.11 | 3.70 ± 0.09  | −0.92     |
| II-2  | 45     | 10  | population  | 249.2 ± 7.8 | 253.8 ± 10.9 | 1.08      |
|       |        |     | mean sugar  | 60.8 ± 1.7  | 58.8 ± 2.6   | −2.02     |
|       |        |     | mean vision | 3.73 ± 0.13 | 3.66 ± 0.07  | −1.36     |
| II-3  | 45     | 6   | population  | 249.7 ± 9.5 | 257.5 ± 9.1  | 1.46      |
|       |        |     | mean sugar  | 60.3 ± 1.7  | 58.5 ± 3.1   | −1.25     |
|       |        |     | mean vision | 3.70 ± 0.15 | 3.65 ± 0.09  | −0.71     |

The runs settle by about period 35 (II-1) and drift slowly after 45 (II-2: 262 at period 40, 253
at 90 on a seed), so the periods are a compromise with the 10-second budget; the tests also
compare period 10. Since the ten-seed differences all lean the same way (the format has slightly
more agents and slightly less sugar and vision), I ran fresh seeds (101 on) well beyond what the
tests do: II-1, 100 seeds, period 40: population 315.1 vs 314.5 (−0.53 SE), sugar 68.1 vs 68.1
(0.01), vision 3.79 vs 3.79 (0.16). II-2, 80 seeds, period 50: population 250.3 vs 249.9 (−0.36),
sugar 66.1 vs 65.7 (−1.14), vision 3.76 vs 3.78 (1.27). The lean was noise.

**Tolerance in the tests**: the means may differ by at most 3.5 standard errors of the difference
(two-sample; the largest ten-seed value above is 2.0, a wrong rule would give tens: for example
agents moving to free cells only would change the carrying capacity by far more than the seed
spread of about 7 agents), and the spreads by at most a factor of 3 (the 99% range for a ratio of
deviations from ten runs is 0.43 to 2.3). Floors of 1 agent, 1 sugar and 0.02 vision on the
standard errors keep a statistic with almost no spread from asking for exact agreement. Runs are
deterministic per seed, so the tests do not flake. The tests also check that the landscapes
agree cell for cell, that a seed repeats and another differs, and that II-3 is II-2.

The comparison test takes about 9 seconds (all but a second of it the format runs), against
under 2 for the rest of the family's tests. Format II-1 for 35 periods and 10 seeds is about 3 s.

## Timing

Default parameters (400 agents, 50 × 50), mean of five seeds, 100 periods, this machine:

| Model       | Setup (ms) | Per period (ms) |
| ----------- | ---------- | --------------- |
| II-1 coded  | 1.2        | 0.44            |
| II-1 format | 40.6       | 6.40            |
| II-2 coded  | 1.2        | 0.42            |
| II-2 format | 38.9       | 5.90            |
| II-3 coded  | 1.2        | 0.42            |
| II-3 format | 41.1       | 5.97            |

The format version is **about 14 times slower per period** (6.0 against 0.43 ms) and 33 times
in setup (25 evaluates per cell for the landscape). At 60 frames a second it is
still in budget (about 6 ms against 16), but a family of larger models (Anasazi, Bionland, the
trade models with hundreds of agents each looking at many cells) may not be. Not profiled; the cost
is the per-agent closure and frame work of the flow interpreter.

## Time it took

About 45 minutes of wall-clock, in four parts: reading the format, the interpreter and the port
(about 15); working out that vision and position needed two additions, and making them with tests
(about 10); writing, debugging and checking the model (about 10, mostly the type check on real
and integer, the warning in gap 4, and finding that evaluates are lazy, so only the sets need to
be in a chain); the comparison, timing and this report (about 10). Writing II-2 and II-3 once II-1
worked was minutes, because of the script.

## Check

`npm run check` does not pass in this checkout, for reasons outside this family:

- `@xmldom/xmldom` (a dependency of `packages/spec`) is not installed in `node_modules`, so
  `packages/spec/src/metaabm/*.test.ts` fail to load and `tsc -p packages/spec` reports
  `xml.ts`. Unrelated to this change; `npm install` would fix it.
- `apps/studio/src/catalog/manifest.test.ts` fails because the catalogue manifest and the
  thumbnails are generated for every model (`UPDATE_CATALOG=1 npx vitest run
apps/studio/src/catalog/manifest.test.ts` rewrites `manifest.json` and `thumbnails/`). The three
  pilots each add models to it, so I left it for whoever lands last, to regenerate once.

What I ran on my own files: `vitest` on `packages/models` (473 passed before the last test was
edited; the sugarscape files pass after), `vitest` on `packages/spec/src/metamodel` (144 passed,
with the new test), `tsc -p packages/models` and eslint and Prettier on the family and the spec
files I changed, all clean.

## For the rest of Sugarscape and for Bionland

What II-1 to II-3 say about the estimate:

- **A model is about 80 acts, and most of the cost was gaps, not acts.** The cost of the first
  model was gaps (two additions, one work-around of a checker warning, one type work-around). The
  cost of each further step, if the format can overlay, is its delta.
- **Likely cheap** (a delta of a few acts, using what exists now): II-7 (seasons: `locationY`, `timeNow`,
  `mod`), II-8 (pollution: `diffuse` with rate 1 is Ascape's mean-of-neighbours diffusion, and the
  agents add pollution when they metabolize), II-6 (corner placement: a select restricted by
  `locationX`, `locationY`; the fallback to anywhere has to be said as a second branch), II-4 (but
  that extends III-2).
- **Medium** (new structure the chain adds, no new format feature known): III-2, III-3 (sex,
  fertility, a mate chosen among the neighbours, a child made by `create` with inherited attributes
  set one by one; the port's draw order is not needed), the Spice II models (movement is a
  `maximize` of a welfare that reads the agent and the cell: possible; the port then takes the
  nearest cell, and a select may have only one of `nearest`, `minimize`, `maximize`, so it changes
  to a random one of the best).
- **Needs the format or methods**: II-5 (a neighbour network: `connect` exists; the network drawn
  over the lattice is a view gap), III-6 (cultural tags are boolean arrays; R3 has no arrays, so
  eleven attributes or a method), IV (trade: price bargaining by repeated exchange until MRS
  converges, which is iteration in a flow that has none except by `cause`; probably methods for
  `TradeT2` to `T4`).
- **Bionland** (21 steps, a chain, with a lattice and graph search with Ascape semantics): the
  same arithmetic. Each step costs its delta if overlays exist, and the whole chain's cost in
  copy-paste if they do not; at 900 lines a model, the 23 + 21 models would be about 40,000 lines
  of JSON for about 5% of that in information. That is the argument for the overlay.
- **Speed**: 14 times slower per period will matter for the larger models (see Timing).
- **A format version of a model does not stay in step with its port**: here the coded and format
  names are separate, so Studio shows both. Once a model has a format version that the owner
  accepts, the coded one can go, as the AMP ports did.
