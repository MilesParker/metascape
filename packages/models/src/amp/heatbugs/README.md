# Heatbugs (AMP) (Eclipse AMP examples)

Ported from `Heatbugs.metaabm` of the Eclipse Agent Modeling Platform example models and the Java
generated from it (`srcgen/org/eclipse/amp/examples/heatbugs`). The Brookings/Santa Fe `edu.brooksantafe`
implementation was not read.

- Authors and citation: the sources state none, so `provenance` has neither.
- Licence: EPL-2.0.
- Copyright: the `.metaabm` has no `description` or copyright statement; the fallback "Copyright (c)
  Metascape LLC and others, made available under the Eclipse Public License" is used.

100 heat bugs on a 100 x 100 bounded Moore grid. The heat grid is added first and steps first.

- Heat cells, rule "Diffuse" (two-phase): new heat = (heat + diffusionRate x (mean of neighbours - heat)) x
  (1 - evaporationRate). Any write to a cell's heat is capped at `maximumHeat` (340).
- Bugs, initial rules: "Initialize" (random available cell), "Initialize State" (ideal temperature uniform
  in [135, 240), output heat uniform in [23, 76)).
- Bugs, rule "Seek Heat Rule", shuffled: compute `heat + output` for the current cell; if the cell's heat is
  below the ideal, move to the hottest available cell within one step, otherwise to the coldest (ties,
  within 1e-9, broken at random); then write the computed heat to the cell the bug started on.
- Unhappiness (derived, recorded): |heat of current cell - ideal temperature|.
- Style: bugs are green ovals, cells are shaded black to red by heat / maximumHeat.

## Legacy classes

| Legacy class                                                                   | New model or shared file                                | Status                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------- | ----------------------- |
| `org.eclipse.amp.examples.heatbugs.Heatbugs`                                   | `heatbugs.ts` (`heatbugs`)                              | ported                  |
| `HeatBug`                                                                      | `HeatBug` in `heatbugs.ts`                              | folded into shared code |
| `HeatCell`                                                                     | `HeatCell`, `heatDiffusion`, `setHeat` in `heatbugs.ts` | folded into shared code |
| `HeatBugStyle2D*`, `HeatCellStyle2D*`, `HeatbugsGraphicsAdapter`, `Heatbugs3D` | view specs                                              | not ported: UI only     |

## Kept oddities

- The bug adds its heat to the cell it started on, after moving, using the heat value read before the move.
- The bug's own cell is never a candidate (it is occupied), so a bug always moves if any neighbour is
  free, even when every neighbour is worse than staying. There is no random-move probability.
- The "within one step, include self, available" query reduces to "available Moore neighbours" because
  the bug occupies its own cell.
- `diffusionRate` 1.0 and the grid being bounded mean heat is not conserved at the edges.
- `maximumHeat`, bug count and the draw ranges are model parameters with the legacy defaults; the grid size
  parameters are `width` and `height` (the file's `heatGrid` width and height).
- Random number streams differ from Java.
