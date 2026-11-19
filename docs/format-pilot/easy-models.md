# First batch of the coded models moved into the format: Simple, Life, Diffusion

Status: 2026-11-18. Every model below is a pure-spec format model (no method acts, no change to
`packages/spec`), documented in the `description` of its elements, and in the catalogue beside the
coded model as "… (format)". The coded ports stay. Each has a statistical comparison with its port
over many seeds and is covered by the generated-against-interpreted test of every catalogued format
model (`format-execution.test.ts`).

| Model                                          | Result                                  | Acts | JSON lines | Comparison (seeds, periods)                               |
| ---------------------------------------------- | --------------------------------------- | ---: | ---------: | --------------------------------------------------------- |
| Simple                                         | converted                               |   13 |        145 | 100 seeds, 80 periods, with 2 and 6 agents                |
| Conway's Life: ConwayLife                      | converted                               |   31 |        349 | 12 seeds, 60 periods                                      |
| Conway's Life: ConwayLifeSmallWorld            | converted at the legacy defaults, see 2 |   31 |        349 | 12 seeds, 60 periods                                      |
| Conway's Life: SmallConwayLife                 | converted, with its first-step quirk    |   33 |        378 | 12 seeds, 60 periods (periods 1 to 5 show the quirk)      |
| Game of Life (introductory)                    | converted, see 3                        |  104 |      1,233 | 12 seeds, 60 periods                                      |
| Diffusion: AB                                  | converted                               |   41 |        540 | 16 seeds, 400 periods on 10 by 10                         |
| Diffusion: ABC                                 | converted, see 4                        |   99 |      1,344 | 16 seeds, 200 periods, overall and by half of the lattice |
| Diffusion: ABCDEF, Big ABCDEF, Big ABCDEF (BW) | converted, see 4 and 5                  |  195 |      2,622 | 16 seeds, 200 and 100 periods, overall and by half        |

The tests pass a model when, across seeds, the means of the two versions differ by less than four
standard errors of their difference and the spreads between seeds by less than a factor of three (the
Classes pilot's test). Where the coded model records more, the format version's cells are read
directly (the Diffusion halves). Changing a parameter of a format version (ABCDEF's payoff of B)
makes the Diffusion test fail, so it has power; a change of gamma from 1 to 3 in ABC does not, since
that effect is small at ABC's payoffs.

## What each came to

1. **Simple.** Two agent types, a subject (behaviour 0) and the environment, replace one type with a
   counter; the number of agents is the total of both. The empty lattice of the coded model is left
   out. Happiness is declared real because `min` gives a real (the roadmap's `toInteger` gap again;
   nothing needed it). Comparison, 100 seeds, 80 periods (statistic: coded against format, standard
   deviation across seeds in brackets), run once at 30 seeds: with 2 agents, mean happiness 435 (119)
   against 389 (110), share of periods at the ceiling 0.36 against 0.31, share broken 0.102 against
   0.106; with 6 agents 25.8 (21.6) against 34.4 (29.6). The test has 100 seeds, so a smaller error.
2. **ConwayLifeSmallWorld.** Ascape's small-world lattice with its defaults (radius 1, no rewiring)
   is plain Moore Life with hard edges, which is what the legacy model runs and what is written. The
   coded port also made `radius` and `randomEdgeRatio` parameters, which the legacy model does not
   have. They are not carried: rewiring needs a small-world network generator, which is on the roadmap's
   list of gaps (for the small-world Epidemic). Retiring the coded port would drop those two
   parameters.
3. **Introductory Game of Life.** The random start and the three named patterns (placed at the middle
   with `location2D`, 13 selects) are in. The coded model's parameter for a periodic lattice was
   missing at first, since a format lattice's border rule was fixed in the model. Added afterwards
   (2026-11-18): a space's border rule can be set by one of its own boolean attributes, periodic
   while true and aperiodic while false, so the lattice has a Periodic parameter, as the coded model
   now does too (it was called Wrap). With Periodic off, a glider crashes cell for cell as in the
   coded model, and the "Edges that kill" exploration is kept.
   The R-pentomino option is `rPentomino`, as an option ID has no hyphen.
4. **Diffusion** (all three actions models). The legacy model runs 25 cells chosen by repeated draw
   each period. An act can only cause acts of its own agent type, so a root rule cannot draw 25 cells
   and make each decide, and the format has no setting for agents per period. Each cell instead
   decides with probability 25 over the number of cells (a parameter, Decisions per period, 25): the
   mean number of decisions is the legacy one, the count is binomial and no cell decides twice in a
   period. The weighted choice among three or six actions is a chain of evaluates and a set of interval
   queries (a draw below the first running total, between two, or above the last); the legacy
   `(int) payoff == 0` zero weight is a per-cell weight set at the start. The coded model's two
   charts (each action, in the upper and in the lower half) are not carried: the format cannot count
   the cells of an action within a subset, so the format charts count each action over the lattice
   (the halves are compared in the test by reading the cells). The legacy payoff matrix is read at
   each decision; here it is copied into the cell when it is created.
5. **Big ABCDEF and its black-and-white version** are the ABCDEF model on 20 by 20, and with a new
   boolean parameter, Black and white: the legacy "Black & White" draw feature of the cell class,
   which the legacy BW class only selects in commented-out code. They are catalogue entries with other
   defaults (`variant` in `diffusion/index.ts`), not files.

## Found, for the roadmap

- **No setting for how many agents act in a period** (Classes found this too): Diffusion's repeated
  draw of 25 cells is approximated by a chance.
- **`cause` reaches only acts of the causing agent's own type**, so a rule of one agent cannot make
  agents of another type perform. Checked by the model checker, which says so.
- **A selection cannot be narrowed by comparing coordinates, and logic inside a selection is
  unreliable** (resolved 2026-11-18: a misreading, not a fault). The evaluates were placed in the
  flow between the select and the queries, which puts them on the path after the choice: the
  select chose one candidate there and the queries filtered that one, as in AMF. The checker
  required an evaluate to be upstream of the act that names it, which treated evaluates as
  variables and left no other way to write it. An evaluate named in an input is now a reference,
  worked out where it is named (`docs/metamodel-review.md`, "Evaluates are references"): a query
  straight from the select names the candidate's column, with no flow into the evaluate. Tests in
  `packages/spec/src/metamodel/selection-logic.test.ts`.
- **Counting the members of an agent type that have two attributes at once** (curation): a chart of
  the cells playing an action in the upper half. The roadmap's "means over a qualified subset", for counts.
- **A lattice's border rule as a parameter** (Periodic). Done: a border rule can be set by a
  boolean attribute of the space (`docs/metamodel-review.md`, R6).
- `min` returns a real (`toInteger`): Simple's happiness, Sugarscape's sugar.
- State-from-state setting and an `other` term did not come up.

## Time and effort

Per period, 200 periods after 10, one seed: Simple 0.005 ms (format) against 0.004 ms (coded);
ConwayLife 1.4 against 0.23 (6 times); introductory Life 2.2 against 0.30 (7 times); AB (50 by 50)
0.71 against 0.054 (13 times, since every cell draws a chance each period where the coded model
draws 25 cells); ABCDEF 0.17 against 0.021 (8 times).

About a day: the Life files and Simple were quick (the first compared well at the first try); the
Diffusion decision flow, and the fruitless attempt at a periodic parameter (a third of the time), were the cost. As
before, the JSON was written by throwaway scripts that generate the repeated parts.

## Not done here

- The Studio catalogue manifest and card pictures were regenerated (`UPDATE_CATALOG=1`) so that `npm run check`
  passes; whoever lands next should regenerate it again after rebasing.
- `fromMetaabm` is imported as `fromFormat`; another branch moves it out of `amp/`.
