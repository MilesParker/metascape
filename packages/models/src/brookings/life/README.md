# Conway's Life (Brookings, from Ascape)

Ported from Ascape 5.6.1, package `edu.brook.life`. John Conway's cellular automaton in three forms.
Authors of the model: John H. Conway. Citation: Gardner, M. (1970). Mathematical Games: The fantastic combinations of John Conway's new solitaire game "life". Scientific American, 223(4), 120-123.
Legacy code: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others (BSD licence). This port: EPL-2.0.

| legacy class           | new model or shared file                   | status                  |
| ---------------------- | ------------------------------------------ | ----------------------- |
| `ConwayLife`           | `conwayLife` in `life-models.ts`           | ported                  |
| `ConwayLifeSmallWorld` | `conwayLifeSmallWorld` in `life-models.ts` | ported                  |
| `SmallConwayLife`      | `smallConwayLife` in `life-models.ts`      | ported                  |
| `LifeCell`             | `life-cell.ts` (`LifeCell`)                | folded into shared code |

`LifeCell.java` carries, below its BSD header, a NuTech Solutions "confidential and proprietary" block. The copyright owner confirmed this block is a mistake, so the file was ported like any other BSD source; the NuTech block was not copied.

## Deviations and kept quirks

- `ConwayLife` takes its initial density from `ConwayLife.getInitialAliveDensity()` (a static, default 0.1); here it is the parameter `initialAliveDensity`. Width and height (51) are parameters as in the legacy bean.
- `ConwayLifeSmallWorld`: Ascape's `Array2DSmallWorld` takes each cell's Moore neighbors within `radius` (default 1) and replaces each with probability `randomEdgeRatio` (default 0) by a random cell, redrawing while the cell is already listed elsewhere in the list; the replacement is one-way. The legacy model builds the space with the no-argument constructor, which sets no geometry, so the lattice is not periodic: with the defaults this is plain Moore Life on a 60 by 60 lattice with hard edges. That is what the port does. `radius` and `randomEdgeRatio` are space properties the legacy model does not expose; they are added as parameters with the legacy defaults. The neighbor lists come from the engine's `wireSmallWorld`, which follows `Array2DSmallWorld`. Where every cell is already listed Ascape would loop forever; `wireSmallWorld` skips the entry.
- `SmallConwayLife` (kept bug): `nextAlive` is written only when a cell changes state and starts false, so in the first step every initially live cell dies even with 2 or 3 live neighbors. After the first step `alive == nextAlive` everywhere and the rule is the standard one.
- A count of live cells (`Alive`) is added for the chart; the legacy collector is commented out. Colours: dead black, alive white, as in the legacy cells.
- Updating is synchronous (execute for all cells, then update), by rule order, as in the legacy `ExecuteThenUpdate` rule.
