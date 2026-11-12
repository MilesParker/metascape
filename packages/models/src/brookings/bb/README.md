# Busy Beavers, the `bb` package (Brookings, from Ascape)

Ported from Ascape 5.6.1, package `edu.brook.bb`. There is no About text and the sources name no authors or citation, so none are given here.
Legacy code: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others (BSD licence). This port: EPL-2.0.

## What it models

"Beavers" search for the small Turing machine (two symbols, 3 states by default) that halts after leaving the most 1s on a blank 512-cell tape, with at most 50 transitions allowed (otherwise the trial scores -1). Each step every beaver tries 100 machines. Beavers differ in how they choose rule tables, by number: beaver 0 is `s` (a fixed rule, `Bsr`), numbers 2, 5, 8, ... are `r` (a fresh random table each trial, `Brr`), 1, 4, 7, ... are `g` (a genetic algorithm of 100 whole tables, `Bga`), and 3, 6, 9, ... are `m` (one genetic algorithm of 100 two-entry sub-tables per machine state). The fitness of a table is the sum of per-rule ones counts (`subRuleOnes`). Statistics: average and maximum ones per type.

## Legacy classes

Only `Bb` is a runnable root scape. `Beaver` is the agent, and `Bga`, `Brr` and `Bsr` are the rule sources it uses; they are not four variants of a model.

| legacy class | new model or shared file               | status                  |
| ------------ | -------------------------------------- | ----------------------- |
| `Bb`         | `busyBeavers` in `bb-model.ts`         | ported                  |
| `Beaver`     | `beaver.ts`                            | folded into shared code |
| `Bga`        | `RuleGa` in `rule-search.ts`           | folded into shared code |
| `Brr`        | `RandomRuleSource` in `rule-search.ts` | folded into shared code |
| `Bsr`        | `staticRule` in `rule-search.ts`       | folded into shared code |

## Deviations and kept quirks

- The legacy `Beaver` constants (512, 3, 50, 32, 100) are static; here tape 512 is fixed and states, maximum transitions and trials per step are parameters with the legacy defaults, as is the number of agents (16).
- The legacy numbering counter is static and never reset, so a second run in one JVM would shift the types; here beavers are numbered 0 to n-1 in creation order. I assumed the legacy first run does the same (the prototype agent is not initialized).
- `java.util.Random` is replaced by the engine's seeded `Random`; seeds for each GA come from the beaver's random stream (`0..999999`).
- `Beaver.write()` only prints the best machine to the console (it resets the tape, but nothing later depends on that); omitted. The unused `Bga.verify`, `print` and getters are omitted.
- The 30 by 30 von Neumann lattice (`HostCell`) that `Bb` creates is never used: beavers are not placed on it (`CellOccupant.initialize` is commented out), no view shows it. It is omitted, so there is no spatial view.
- Legacy quirks kept: the GA's selection and replacement (stale `newRules` when fewer children than slots), `maxOnes` only counts halting runs, `action` and `move` tables persist between trials for type `m`, and each beaver also takes one step at start-up through the initial rule (the static beaver also tries one extra machine on its first step).
- Chart: the legacy chart plots the maximum of the seven statistics (`RAOnes`, `GAOnes`, `MAOnes`, `SMOnes`, `RMOnes`, `GMOnes`, `MMOnes`); all series are recorded as `<name>.max` and so on.
