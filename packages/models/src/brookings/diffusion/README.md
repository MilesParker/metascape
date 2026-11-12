# Diffusion (Brookings, from Ascape)

Ported from Ascape 5.6.1, package `edu.brook.diffusion`. Norms of behavior spread through a lattice: cells adopt actions by inherent payoff plus local popularity (the number of neighbors who took the action), subject to random error.
Authors and citation, from `AboutDiffusion.html`: H. Peyton Young, "Diffusion in Social Networks", CSED Working Paper #2, The Brookings Institution (the About text gives no year). The text adds that the implementation is a Java version of a model first written in Pascal by Robert Axtell, implemented by Miles Parker.
Legacy code: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others (BSD licence). This port: EPL-2.0.

| legacy class               | new model or shared file                                                     | status                  |
| -------------------------- | ---------------------------------------------------------------------------- | ----------------------- |
| `ABModel` (and `ABCell`)   | `abDiffusion` in `ab-model.ts`                                               | ported                  |
| `ABCModel` (and `ABCCell`) | `abcDiffusion` in `abc-model.ts`, shared `action-cell.ts`, `action-model.ts` | ported                  |
| `ABCDEFModel`              | `abcdefDiffusion` in `abcdef-models.ts`                                      | ported                  |
| `ABCDEFCell`               | `action-cell.ts` (`ActionCell`, one class for 3 and 6 actions)               | folded into shared code |
| `BigABCDEFModel`           | `bigAbcdefDiffusion` (span 20)                                               | ported                  |
| `BigABCDEFModelBW`         | `bigAbcdefDiffusionBW`                                                       | ported (see below)      |

## Deviations and kept quirks

- Legacy settings were static fields of the cell classes; they are per-simulation here.
- Execution: each step 25 cells are chosen by repeated random draw (with replacement) and each decides at once (asynchronous). Spans: 50 (AB), 10 (ABC, ABCDEF), 20 (Big).
- A payoff whose integer part is 0 gives the action zero weight (`(int) charAction == 0`), kept. So in ABC, low cells always take A, and medium cells choose only between A and B. If all weights are zero the last action is chosen, as in the legacy final `else`.
- The popularity term always divides by 8, the Moore neighbor count. The AB model has no popularity term: its payoff is the sum of pairwise payoffs against its four von Neumann neighbors.
- Legacy float arithmetic is double here; the random sequence differs from Java.
- `BigABCDEFModelBW`: its only code is `createViews()` calling `super`; the line that selects the "Black & White" draw feature is commented out, so as legacy code it is identical to `BigABCDEFModel` (confirmed). It is ported as a model using the black and white scheme from `ABCDEFCell.DRAW_BandW_Feature` (A white, B gray, C black). D, E and F were hatched fills; they are approximated by greys.
- Statistics: ABC and ABCDEF count each action in the upper and lower half (`y < height / 2`) with two charts, as the legacy collectors; the ABCDEF series keep the legacy names ".6" (A), ".5" (B), ".4" (C), ".9" (D), ".8" (E), ".7" (F). The AB model had none; A and B counts are added.
- Dropped: cell sizes, applet check, draw-every-N-updates.
