# Civil Violence (Brookings Institution models, from Ascape)

Joshua Epstein's agent-based models of civil violence, ported from Ascape 5.6.1 (`edu.brook.cv`).
Model I is rebellion against a central authority: citizens with grievance (hardship times
illegitimacy) turn active when it outweighs their perceived risk of arrest; cops jail active citizens
in view. Model II is violence between two groups (blue and green) that multiply and die, where active
citizens attack members of the other group in view and cops act as peacekeepers.

Citation: Epstein, J. M. (2002). Modeling civil violence: An agent-based computational approach.
PNAS, 99(suppl. 3), 7243-7250. (The `About*.html` files cite the working paper by Epstein, Steinbruner
and Parker, CSED Working Paper #20, 2001; the PNAS citation is the one given for this port.)
The legacy implementation is by Miles Parker, The Brookings Institution. Licence: BSD
(`LICENSES/brookings-models-license.txt`); this port is under EPL-2.0.

## Files

- `agents.ts`: `Citizen`, `CitizenBlueGreen`, `Cop`, shared run state.
- `vision.ts`: Ascape's rank-based lattice search (`countWithin`, `findNearest`).
- `core.ts`: parameters, the shared builder (rules, data, views) and model factories.
- `model-i.ts`, `model-ii.ts`: one exported model per legacy class.

## Legacy classes

| legacy class                                                                 | new model or shared file | status                  |
| ---------------------------------------------------------------------------- | ------------------------ | ----------------------- |
| `cv.CVModel`                                                                 | `cvModel`                | ported                  |
| `cv.CVModelInterGroup`                                                       | `cvModelInterGroup`      | ported                  |
| `cv.CVModelInterGroupRetr`                                                   | `cvModelInterGroupRetr`  | ported (see deviations) |
| `cv.Citizen`                                                                 | `agents.ts`              | folded into shared code |
| `cv.CitizenBlueGreen`                                                        | `agents.ts`              | folded into shared code |
| `cv.Cop`                                                                     | `agents.ts`              | folded into shared code |
| `cv.paper.CVModelI`                                                          | `cvModelI`               | ported                  |
| `cv.paper.CVModelIRun1`                                                      | `cvModelIRun1`           | ported                  |
| `cv.paper.CVModelIRun2`                                                      | `cvModelIRun2`           | ported                  |
| `cv.paper.CVModelIRun3and4and5`                                              | `cvModelIRun3and4and5`   | ported                  |
| `cv.paper.CVModelIRun3`                                                      | `cvModelIRun3`           | ported                  |
| `cv.paper.CVModelIRun4`                                                      | `cvModelIRun4`           | ported                  |
| `cv.paper.CVModelIRun5`                                                      | `cvModelIRun5`           | ported                  |
| `cv.paper.CVModelII`                                                         | `cvModelII`              | ported                  |
| `cv.paper.CVModelIIRun1`                                                     | `cvModelIIRun1`          | ported                  |
| `cv.paper.CVModelIIRun2and3`                                                 | `cvModelIIRun2and3`      | ported                  |
| `cv.paper.CVModelIIRun4aandb`                                                | `cvModelIIRun4aandb`     | ported                  |
| Swing sliders, customizer, draw features (in `CVModel`, `CVModelInterGroup`) | views in `core.ts`       | not ported: UI only     |

## Behaviour kept from the legacy code (including oddities)

- Arrest probability: `1 - e^(-k * (cops / (active + 1)))` with `k = -ln 0.1`, where the legacy code
  divides two Java `int`s, so the quotient is truncated. It is zero unless cops outnumber active
  citizens plus one within vision. Kept (`Math.trunc`). The retaliation estimate uses real division.
- Vision follows Ascape's `Array2D` search: Euclidean ranks, counting uses distance `<=` vision, but
  `findNearest` uses a strict `<` (so vision 7 does not reach a target exactly 7 away), ties are
  broken at random, and offsets reach 16 cells at most. Edges wrap (torus), 8-cell Moore neighbors.
- Random walk tries one random neighbor and stays put if it is occupied. Jailed citizens leave the
  lattice and are released next to their old home (nearest free site within 16, else anywhere).
- Jail term is uniform 0..jailTerm; `2147483647` (Java `Integer.MAX_VALUE`) means never released.
- Rule orders: citizens walk, check jail, decide state (Model II then fission, metabolism, death,
  attack); cops patrol then walk; people act before cops, agents in random order each tick.
- Cop count is corrected after each tick (after the data sample) to `trunc(target * sites)`, killing
  random cops or adding new ones, as `scapeIterated` did. Run 3, 4 and 5 change legitimacy or the
  target at that point, so data shows the old value for one tick.
- Model II: the recorded blue and green legitimacies (distrust with evaporation) are computed from kill
  counts and are display-only; the grievance still uses the single `legitimacy`. The guards test the
  other group's count than the divisor (kept). The kill series named "Greens Killed By Blue" and
  "Blues Killed By Green" are per tick. Computed with doubles, the legacy used floats.
- `CVModelInterGroup` defaults (from live code, not comments): no cops, initial blue/green legitimacy
  0.2, evaporation 0.9, legitimacy 0.80. `CVModelII` equals it. Runs 1 to 4: see `model-ii.ts`.

## Deviations

- `CVModelInterGroupRetr` throws in Ascape on construction (it selects `DECIDE_STATE_RETRIBUTION`,
  which `CVModelInterGroup` never adds, only comments out). The port runs the evidently intended
  behaviour: the retaliation decision rule replaces the ordinary one in the same position.
- Parameters added: lattice `width` and `height` (fixed 40 x 40 in the legacy code; default kept).
- Model I does not expose `fissionProbability` or `deathAge` (public in `CVModel` but inert there).
- Runs 3 to 5 set legitimacy in `scapeSetup`; here it is the parameter default (0.90, Run 5: 0.80).
  Run 5's start target of 6% and the Run 3 to 5 stepping constants are fixed in the model, not parameters.
- Initial placement happens in a setup step instead of an initial rule, so cloned citizens are not
  re-placed. New cops are placed at random, as in the legacy.
- Not ported because nothing selects them: `ATTACK_BLUE_ON_GREEN`, `ATTACK_RETALIATION`,
  `ATTACK_OTHER_ACTIVE` rules, `DECIDE_STATE_RETRIBUTION_2` and `_3` with their estimates,
  `moveTowardsActivity`, `moveFromCop`, `notifyNeighborsOfCapture`. The `UPDATE_RULE` is a no-op.
- Random seeds in the legacy paper classes (`setRandomSeed`) are not reproduced; runs are
  deterministic per Metascape seed only.
- `About*.html` states no qualitative results, only that the models exist. The tests check punctuated
  outbursts for Model I, Run 2 (the paper's finding) on a 20 x 20 lattice: it holds there.
- A cell holds one agent, citizen or cop, as in the legacy single lattice.
