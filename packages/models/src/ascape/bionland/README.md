# Bionland (Ascape example models)

A step-by-step tutorial from Ascape 5.6.1 (`org.ascape.examples.bionland`). Step A is a bare lattice with randomly placed "bions"; each later letter adds a little (movement, three species that chase one another, tile energy, stored energy with fission and death, statistics, diffusion, other lattices and spaces) up to the full model. There is no About text; descriptions come from the source.

- Copyright: Copyright 1998-2007 The Brookings Institution, NuTech Solutions,Inc., Metascape LLC, and contributors. BSD licence, `LICENSES/ascape-license.txt`.
- Authors and citation: not stated in the sources, so none are given.
- Ids: family `ascape-bionland`, collection "Ascape example models".

## Structure

The Java steps are near-copies of each other. Here `lattice-model.ts` holds the shared behaviour once (bions, tiles, move, consume, leave-energy, fission, death, diffusion, statistics, views) and `steps.ts` states each step as its predecessor's `LatticeConfig` plus the few entries it changes, in the same order as the diffs below. `lattice-space.ts` ports the Ascape neighbour searches the steps depend on. Step Q (continuous space) and Steps R and S (graphs) are different worlds and live in `continuous.ts` and `graph.ts`.

## What each step adds

| Model                 | Legacy class | Adds                                                                                                                                                                                                    |
| --------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Step A                | Model_A      | 25 x 25 Moore lattice (periodic), 100 bions at random positions.                                                                                                                                        |
| Step B                | Model_B      | Random walk rule; light gray tiles.                                                                                                                                                                     |
| Step C                | Model_C      | Three species (red, orange, blue), initial density 28% shared between them (58 each); black tiles.                                                                                                      |
| Step D                | Model_D      | Vision (min/max 8) and "move away from nearest" rules, selected as a cycle (red from blue, orange from red, blue from orange).                                                                          |
| Step E                | Model_E      | Tile energies, leave-energy rule, consume-energy rules (each species eats the other two), leakage 0.02 and consumption 0.015; tile colour mixes the energies.                                           |
| Step F                | Model_F      | View only: ball images in 15 px cells (circles here; Step E draws squares).                                                                                                                             |
| Step G                | Model_G      | Stored energy (initial 1.5), fission above 2, death at 0 or less; vision hard-coded to 8.                                                                                                               |
| Step H                | Model_H      | "Move toward / away from maximum energy" rules replace the move-away rules in use; `bionEnergyGain`.                                                                                                    |
| Step I                | Model_I      | Stored-energy statistics per species and chart of their averages.                                                                                                                                       |
| Step J                | Model_J      | Plain diffusion (tile becomes the mean of its neighbors) of the three energies; territory in rule order; chart of counts; ball images commented out.                                                    |
| Step K                | Model_K      | Parameterized diffusion (`diffusionConstant` 1, `evaporationRate` 0, same behaviour as J at defaults); ball images back.                                                                                |
| Step L                | Model_L      | Von Neumann lattice; slider customizer (not ported).                                                                                                                                                    |
| Step M                | Model_M      | Moore again; custom draw with energy rings; chart commented out.                                                                                                                                        |
| (no N or O)           |              | The Java series has no `Model_N` or `Model_O`; the letters only appear in `ModelData_N` and `ModelData_O`.                                                                                              |
| Step P                | Model_P      | One-dimensional ring of 190 sites, density 10%, tiles coloured by the raw energies.                                                                                                                     |
| Step Q                | Model_Q      | Continuous 600 x 600 periodic space; the species chase of Step D with vision 60 to 100 and velocity 7 to 13 (no energy).                                                                                |
| Step R                | Model_R      | Random directed graph of 50 nodes whose links are rebuilt now and then; the species chase on it.                                                                                                        |
| Step S                | Model_S      | Small-world graph (ring plus random edges) instead of the random graph.                                                                                                                                 |
| Full Model            | Model        | Ring of 190, density 28%, consumption 0.023, no random walk, each species eats only its prey, random vision, `fissionEnergy`, energy gain scales what is left behind, rule order death, fission, leave. |
| Data Run (Full Model) | ModelData    | The full model stopping at tick 50.                                                                                                                                                                     |
| Data Run N            | ModelData_N  | Step M on 10 x 10, stopping at tick 2000.                                                                                                                                                               |
| Data Run O            | ModelData_O  | Step M on 10 x 10, stopping at tick 500.                                                                                                                                                                |

## Legacy classes

| Legacy class             | New model or shared file                        | Status                                  |
| ------------------------ | ----------------------------------------------- | --------------------------------------- |
| Model_A to Model_M       | `steps.ts` (Steps A to M) on `lattice-model.ts` | ported                                  |
| Model_P                  | `steps.ts` (Step P)                             | ported                                  |
| Model_Q                  | `continuous.ts`                                 | ported                                  |
| Model_R, Model_S         | `graph.ts`                                      | ported                                  |
| Model                    | `steps.ts` (Full Model)                         | ported                                  |
| ModelData                | `steps.ts` (Data Run (Full Model))              | ported (stop period only; see below)    |
| ModelData_N, ModelData_O | `steps.ts` (Data Run N, Data Run O)             | ported (grid size and stop period only) |

`ModelData*` are launchers that subclass the full model or Step M, change settings (grid size 10 x 10, stop period) and add console output, data output files (`DataOutputView`) and, for `ModelData` and `ModelData_O`, a parameter sweep of `DiffusionConstant` from 0 to 1 in steps of 0.05. The settings are ported as models; the console, files and sweep are not (use `sim.data.toCSV()` and run the model with different `diffusionConstant` values instead).

## Deviations and kept legacy behaviour

- **Vision in Steps G to M and P is fixed at 8** (`vision = 8` in `Bion.initialize`), so the minimum and maximum vision parameters have no effect there. Kept; the parameters are listed and say so. Steps D to F and the full model draw vision from the range.
- **Search reach is capped.** Ascape's Euclidean neighbour-rank table is complete only to distance sqrt(61) (about 7.8) and then jumps to junk entries; searches here stop at that distance, so a vision above 8 behaves like 8 on 2D lattices. Nearest searches use the strict test `distance < vision` on a 2D lattice and `<= vision` on the ring and in graphs, as the Java does.
- **Von Neumann quirks (Step L).** Nearest searches and stepping toward or away are the same as on a Moore lattice (both lattices are periodic and Ascape's code is identical there); "move toward / away from maximum energy" only sees cells in the same row or column (Ascape's "line of sight" distance for von Neumann), which is what the Java does; an away step may be diagonal.
- **Moving away where the origin is the target** (the energy maximum is the bion's own tile): Ascape picks a random neighbor and moves only if it is free; kept.
- **Initial placement** is done once in `sim.setup` (shuffled bions, each to a uniformly random free site), equivalent to Ascape's initial rule `MOVE_RANDOM_LOCATION_RULE`; it is not an initial rule so that children born by fission are not re-placed. If no free site remains a bion dies, as in Ascape.
- **Fission** halves the energy between parent and child, placing the child on a random free neighbor, only when one exists. In the tutorial steps the child is a clone of the parent (vision 8); in the full model the child re-initializes (random vision) as `child.initialize()` does.
- **Float constants** (`0.28f`, `0.02f`, `0.015f`, `0.023f`) are used as plain decimals.
- **Step E and F** differ only in drawing. Ball images, 15 px cells, custom draw features, the energy rings of Step M, the slider customizers of Steps L, M, P and the full model, and the time-scrolling 1D view are replaced by a `gridView` (tile colours as in the legacy colour features, occupants in species colours) and are otherwise not ported. In Step M the rings shrinking with stored energy are not shown.
- **Charts.** Legacy charts exist only in Steps I to L (and are commented out in M and the full model). Every model here has at least one chart; Steps A to H, P, the full model and the data runs chart bion counts, Steps I to L chart what the legacy chart did (Step I the average stored energy, Steps J to L the counts).
- **Step Q** had no statistics; the chart shows the added mean distance to nearest prey. Steps R and S chart the added total number of links. Their views use `continuousView` and `networkView` (nodes on a circle).
- **Continuous space.** Movement toward a target and away from it follows `Continuous2D.moveToward` / `moveAway` literally (toward clamps per axis and takes the short way round the torus; away uses the plain, unwrapped direction). Ascape's searches exclude anything at exactly the searcher's coordinates; kept. The three species step one after another, each in random order, as three Ascape scapes do.
- **Graphs.** Ascape's adjacency lists allow duplicate links; here a link exists once. Ascape's `Graph` is directed by default; here every link is stored one way and undirected links are two links. Rebuilding a node's links (`Change Neighbors`) clears only its own out-links, as in Java, and uses `<=` where the first assignment uses `<`. The small-world ring and random edges are built after the bions are placed (Ascape builds them when the space initializes); this does not change the result. Edge thickness, edge visibility and agent size (R and S) were drawing settings and are dropped.
- **Execution order.** Each species scape runs its rules agent by agent in random order, species in order red, orange, blue after the territory, as Ascape's default. The territory (diffusion) runs by rule, two-phase, before the bions.
- **No legacy bug was silently fixed.** Notably: the hard-coded vision of Steps G to M, the junk tail of Ascape's rank table, and `findCellAway` thresholds (`rx - 1`) are ported as written.

## Tests

`bionland.test.ts`: every model builds and runs 25 ticks, is deterministic for a seed and differs for another; initial populations; single occupancy; tile energy stays in 0 to 1; diffusion conserves energy and evaporation drains it; fission and the full model's population change; data-run stop periods; the lattice search and step helpers; the graph search and step helpers; Step S's ring.
