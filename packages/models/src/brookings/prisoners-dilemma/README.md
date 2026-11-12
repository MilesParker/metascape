# Demographic Prisoner's Dilemma (Brookings, from Ascape)

Ported from Ascape 5.6.1, package `edu.brook.pd`. Players with a fixed, inherited
strategy of cooperate or defect move to random sites on a lattice and play a
neighbor each tick. Payoffs accumulate as wealth; players above the fission
threshold clone onto a free neighboring site, and players with negative wealth
(or older than the death age) die. Zones of cooperation emerge.

Model: Joshua M. Epstein. The `AboutPD2D.html` text names this model as the basis of
Epstein, J. M. (1998). Zones of cooperation in demographic prisoner's dilemma.
_Complexity_, 4(2), 36-48. It says the Java version was implemented by Miles Parker
at the Brookings Institution from Epstein's C++ model.

Licence: legacy files are BSD (`LICENSES/brookings-models-license.txt`), copyright
"1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others".
The port is EPL-2.0.

## Files

- `demographic-pd.ts`: shared player, parameters, build function, statistics.
- The `PD2DCellular` lattice uses the engine's `wireSmallWorld`, which gives each cell the
  neighbors Ascape's `Array2DSmallWorld` gives it.
- `models.ts`, `index.ts`: the four models and the family.

## Legacy classes

| legacy class     | new model or shared file          | status                                |
| ---------------- | --------------------------------- | ------------------------------------- |
| `PD2D`           | `pd2d` ("Demographic PD: PD2D")   | ported                                |
| `PD2DSmallWorld` | `pd2dSmallWorld`                  | ported (equals PD2D, see below)       |
| `PD2DCellular`   | `pd2dCellular`                    | ported                                |
| `PD2DDemo`       | `pd2dDemo`                        | ported (legacy cannot run, see below) |
| `Player`         | `PdPlayer` in `demographic-pd.ts` | folded into shared code               |

## Rules as ported

Initial: 100 players on a 20 x 20 von Neumann torus (Demo: 30 x 30), random strategy,
age uniform in 0..deathAge, wealth 6, each moved to a random unoccupied cell (removed
if none). Each tick, rule by rule, every live player in one shuffled order: Random Walk
(step to a random neighbor cell only if it is free), Play Random Neighbor (one random
occupied neighbor), Fissioning (wealth > 11: child on a free neighbor with wealth 6,
age 0, parent pays 6, strategy copied unless a 10% mutation draws it at random), Update
(age + 1), Death (wealth < 0 or age > 100). Players born during a tick first act in the
next one (Ascape's iterators are snapshots taken at the start of the tick, with a single
shuffle shared by all rules, as in the engine's `byRule` schedule). Payoffs C/C 2, D/C 6,
C/D -6, D/D -5.

## Deviations and kept legacy behaviour

- `PD2DDemo` cannot run in Ascape: it extends `Scape`, not `PD2D`, but `Player` casts its
  root to `PD2D` and throws a `ClassCastException` on the first agent. It is ported as
  intended: the same rules and values, a 30 x 30 lattice, and its smaller set of
  statistics (no age statistics).
- `PD2DSmallWorld` has its `Array2DSmallWorld` line commented out and builds a von Neumann
  lattice, so it is `PD2D` again. Ported as written.
- `PD2DCellular` calls `super.createScape()` and then builds a second lattice and a second
  population without removing the first. The first population never gets an extent, so it
  is empty and has no effect; it is not ported. The legacy statistics and chart were attached
  to that empty population (the chart always read 0); here they are recorded on the live
  population. Its lattice is `new Array2DSmallWorld()` with default settings: Ascape's
  default geometry is non-periodic, the radius is 1 and `randomEdgeRatio` is 0, so cells
  have the 8 Moore neighbors, fewer at the edges, no wrap-around, no random links.
- Likewise the statistics of `PD2DSmallWorld` were lost with its removed first population;
  they are recorded here.
- `dieAtDeathAge` is a parameter but, as in the legacy code, never read.
- The legacy typo `inheiritedWealth` is spelled `inheritedWealth`. `nAgents` and
  `numberOfAgents` were two beans for one field; there is one parameter.
- Lattice width and height are parameters. In Ascape their setters had no effect once the
  model was created; here they take effect.
- The rules `Play Neighbors` and `Play Other` were added to the legacy rule list but not
  selected, so they never ran; they are omitted.
- Random number sequences differ from Java's (not required).
- Views: grid (blue cooperators, red defectors) plus a time series and bars of the two counts.
  The overhead view's cell size and Swing details are not ported.
