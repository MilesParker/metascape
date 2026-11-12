# Spatial Iterated Prisoner's Dilemma with a genetic algorithm (Brookings, from Ascape)

Ported from Ascape 5.6.1, package `name.milesparker.spatialipd`. Players on a 20 x 20
torus play an iterated Prisoner's Dilemma against a neighbor. A player's strategy is a
chromosome: for memory size m, 4^m response bits indexed by the last m rounds (own move
and partner's), 2m bits of assumed history before a first meeting, and one preference bit
(closest or furthest partner). Rich players clone onto a free neighbor with their
chromosome; every tick each player may cross its chromosome over with a random neighbor
(probability 0.01) and flips each bit with probability 0.01.

Author: Miles T. Parker. The sources and the (absent) About text state no publication, so
there is no citation. The model builds on Epstein's demographic Prisoner's Dilemma
(`../prisoners-dilemma`), as the legacy classes extend `PD2D` and `Player`.

Licence: `Copyright 2000 Miles T. Parker.`, BSD (`LICENSES/brookings-models-license.txt`);
the port is EPL-2.0.

`PD2DGAMulti.java` carries a stray "confidential and proprietary to NuTech Solutions"
block under its BSD header. The copyright owner confirmed it is a mistake, so the file was
ported like the others and the block was not copied.

## Legacy classes

| legacy class        | new model or shared file                      | status                                         |
| ------------------- | --------------------------------------------- | ---------------------------------------------- |
| `PD2DGA`            | `pd2dga`                                      | ported                                         |
| `PD2DGA_RANDOM`     | `pd2dgaRandom`                                | ported (identical to `PD2DGA`, see below)      |
| `PD2DGA_CLOSEST`    | `pd2dgaClosest`                               | ported                                         |
| `PD2DGA_FURTHEST`   | `pd2dgaFurthest`                              | ported                                         |
| `PD2DGA_PREFERENCE` | `pd2dgaPreference`                            | ported (legacy throws when created, see below) |
| `PD2DGAMulti`       | `pd2dgaMulti` + `pd2dgaMultiDesign`           | ported: model plus experiment design           |
| `PD2DGAMultiple`    | `pd2dgaMultiple` + `pd2dgaMultipleDesign`     | ported: batch harness as experiment            |
| `PD2DGAMultipleTo`  | `pd2dgaMultipleTo` + `pd2dgaMultipleToDesign` | ported: batch harness as experiment            |
| `PlayerGA`          | `GaPlayer` in `spatial-ipd.ts`                | folded into shared code                        |
| `Chromosome`        | `chromosome.ts`                               | folded into shared code                        |

The three batch classes only add data output and a parameter sweep to a `PD2DGA`. They are
kept as models (same dynamics, so they can be watched) and their sweeps are experiment
designs in `experiments.ts`, to be run with `runExperiment(model, design)`:
`PD2DGAMultiple` is 35 runs of 1000 ticks, memory size 1, writing the final summed ratios;
`PD2DGAMultipleTo` is 35 runs until the population dies out (the model stops itself with
reason `extinct`; the end tick is the `ticks` column); `PD2DGAMulti` writes the eight
commonest genomes and their counts.

## Rules as ported

Settings that `PD2DGA` applies on top of `PD2D`: payoffs C/C 3, C/D -5, D/C 6, D/D -2,
fission wealth 20, mutation rate 0, memory size 1, mutation and crossover probability 0.01,
`trackAll` 0, 20 x 20 lattice, and agent-order execution. Each tick every live player, in
one shuffled order, runs the selected rules in the legacy list order: Random Walk, Play
Random Neighbor, Fissioning, Update, Death, Play Closest, Play Furthest, Play Preference,
Crossover, Mutation. A player removed by Death skips the rest. Variants:

- `PD2DGA`, `PD2DGA_RANDOM`: random neighbor play.
- `PD2DGA_CLOSEST` / `_FURTHEST`: random play off; play the neighbor with the smallest /
  largest Hamming distance between whole chromosomes (ties at random; no play if no
  occupied neighbor). The play rule comes after Death in the list.
- `PD2DGA_PREFERENCE`: random play off; the preference gene (0: closest, 1: furthest).
- `PD2DGAMultiple`: random play plus preference play (it does not switch random play off).
- `PD2DGAMultipleTo`: random play plus closest play, stop at extinction.

Statistics: the `PD2D` ones, plus sum, mean and count of each player's cooperate and
defect ratio and of those ratios split by preference gene. A player's ratio is the share
of cooperation in its own last active turn.

## Deviations and kept legacy behaviour

- `PD2DGA_PREFERENCE`, `PD2DGAMultiple` call `setSelected("Play Preference")`, but no rule of
  that name exists (`PlayerGA` defines `playPreference()` and rules Play All/Closest/Furthest
  only), so in Ascape these classes throw when created. The missing rule is supplied by
  wiring `playPreference()` and placing it after Play Furthest. This is a judgment call.
- `PD2DGA_RANDOM` only selects the already selected random-neighbor rule, so it equals
  `PD2DGA`; `PD2DGAMulti` equals `PD2DGA` apart from its data export.
- Legacy clone quirks kept: a child shares its parent's play-history object (so their
  histories move together); all players share one partner table when `trackAll` is 1, keyed
  by partner only; a child starts with the parent's cooperation counts; a child's age is
  drawn uniformly 0..deathAge, not 0; the Player-level `mutationRate` and the `strategy`
  field have no lasting effect because every play overwrites `strategy`.
- Wealth can be negative at the end of a tick: with agent order, a neighbor may play a
  player after that player's own Death check.
- The `Play All`, `Play Neighbors` and `Play Other` rules were never selected by any class
  and are omitted.
- The sixteen per-chromosome stat collectors (for a commented-out chart) are not ported.
- Views: grid coloured by genome (the legacy view drew a random colour per genome and an
  outline by cooperation ratio; here the colour is a deterministic hash of the strategy
  bits and there is no outline), a chart of the summed cooperate and defect ratios, and for
  `PD2DGA_PREFERENCE` the four-series chart by preference.
- In the legacy sweeps the columns "Count Cooperate Closest" and the like were counts of
  all players, not of the matching ones; the designs here output the summed ratios instead.
- The legacy sweeps wrote tab-separated files; the designs return rows for `rowsToCSV`.
- Random number sequences differ from Java's (not required). Extinction is common with
  these payoffs under random and furthest play.
