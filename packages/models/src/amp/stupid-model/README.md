# StupidModel (Eclipse AMP examples)

Steps 1, 2, 3 and 5 of the StupidModel teaching series, ported from the Eclipse Agent Modeling Platform
(AMP) example models `StupidModel1.metaabm`, `StupidModel2.metaabm`, `StupidModel3.metaabm` and
`StupidModel5.metaabm` (there is no step 4 in AMP). Bugs live on a 100 x 100 periodic Moore grid of
habitat cells.

- Authors: Steven F. Railsback, Steven L. Lytinen and Volker Grimm.
- Citation: Railsback, S. F., Lytinen, S. L., & Grimm, V. (2005). StupidModel and extensions: A template
  and teaching tool for agent-based modeling platforms.
- Licence: EPL-2.0 (the AMP sources are EPL licensed).
- Copyright: none of the four `.metaabm` files carries a `description` or a copyright statement. The
  files and headers therefore use the fallback "Copyright (c) Metascape LLC and others, made available
  under the Eclipse Public License".

The citation was given with the task. The AMP sources do not state any author or publication; the only
descriptive text is the rule description in StupidModel1 ("Move to a neighboring space. (In this
version we also have to manually notify the bug's broker. :( )"). It does not contradict the citation:
the model names and the step structure (random movement, growth, food, consumption) match. I could not
check the paper's parameter values against the AMP ones.

## Models

| Model         | Rules per tick (in order)                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| StupidModel 1 | Habitats: none. Bugs: Random Movement. Bugs are red, habitats green.                                                           |
| StupidModel 2 | Bugs: Random Movement, Grow (size + 1, integer). Bug colour fades white to red as size goes 0 to 10.                           |
| StupidModel 3 | Habitats: determindFoodProduction (food += uniform [0, 0.01)). Bugs: Random Movement, Grow (size + 1). Habitats black.         |
| StupidModel 5 | Habitats: food += uniform [0, 0.5). Bugs: Random Movement, Grow (eat `min(food, 0.2)` of the cell's food, size += that, real). |

The habitat scape is added first and so steps before the bugs. Both scapes run by rule, in shuffled
order, as the original's `RULE_ORDER` with random execution. Bugs start on a random available cell
(initial rule "Initialize"). Random Movement picks uniformly among available (unoccupied) cells within
Moore distance `bugVision`, excluding the bug's own cell, and does nothing if there is none.

Parameters: `bugCount` (100), `habitatCount`, `bugVision` (4), grid `width` and `height` (100).

## Legacy classes

| Legacy class                                                                                               | New model or shared file        | Status                  |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------- |
| `org.metaabm.examples.stupid1.StupidModel1`                                                                | `stupid-model-1.ts`             | ported                  |
| `org.metaabm.examples.stupid2.StupidModel2`                                                                | `stupid-model-2.ts`             | ported                  |
| `org.metaabm.examples.stupid3.StupidModel3`                                                                | `stupid-model-3.ts`             | ported                  |
| `org.metaabm.examples.stupid5.StupidModel5`                                                                | `stupid-model-5.ts`             | ported                  |
| `stupidN.Bug` (four versions)                                                                              | `Bug` in `stupid-model.ts`      | folded into shared code |
| `stupidN.Habitat` (four versions)                                                                          | `Habitat` in `stupid-model.ts`  | folded into shared code |
| `*Style2D`, `*ColorProvider`, `*FigureProvider`, `*Graphics`, `*GraphicsAdapter`, `*AdapterFactory`, `*3D` | view specs in `stupid-model.ts` | not ported: UI only     |

## Deviations and kept oddities

- `habitatCount` is a model attribute in the originals but no act reads it (the habitats are the grid
  cells). It is kept as a parameter that is pinned to 0 and has no effect.
- StupidModel 2 has a further attribute `maxBugSizeColor` with no type and no default that nothing
  reads; it is not ported. The colour scale uses the style's literal 10.
- Habitat colour in StupidModel 2 is not defined by its style (no rules); black is used so that the
  white-to-red bugs are visible.
- StupidModel 3 and 5 differ from 2 in the habitat food rate (0.01 vs 0.5) and in what Grow does; in
  StupidModel 3 bugs do not use food. In StupidModel 5 the maximum food production rate is 0.5 and
  movement is still random (bugs do not seek food), as in the file. Maximum consumption (0.2) is a
  per-bug attribute, not a model parameter.
- The StupidModel 5 `consumption` attribute exists on the bug but is never read or written.
- Bug colour channels are truncated to integers as in the generated Java.
- Data: the legacy collector is "Bugs Population". Mean/max bug size and mean food are added so the
  charts show something other than a constant.
- A bug is created without a cell if there is no available cell for it (more bugs than cells).
- Random number streams are not those of Java; runs are deterministic for a seed only.
