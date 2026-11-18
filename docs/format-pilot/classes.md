# Format pilot: Emergence of Classes, Model One

Status: 2026-11-17. `packages/models/src/brookings/classes/ClassesModelOne.model.json`, in the
catalogue as "Emergence of Classes: Model One (format)" beside the coded port, with Figures 2
and 3 as its run specs. Pure spec: no method acts, no change to `packages/spec`.

## How memory is represented

R3's route works. Each bargainer is a nested scape holding its memories, each memory an agent
with a `share` (the share that opponent demanded) and a `stamp` (when it was made, by its
owner's `clock`). "Select memory" from a bargainer finds only its own memories, since the
search runs in the scape around the selection.

- **Start:** `create memory` with `agentCount` = the drawn memory size; each new memory takes the
  share of a randomly selected demand (low or high only with `highLowStart`).
- **Remember** (a perform): select the memory minimizing `stamp` and `die`; tick the clock;
  `create` a memory with the share just heard. A ring buffer becomes "forget the oldest,
  note the new".
- **Best reply** (a perform): three `demand` agents (low, medium, high) stand for the choices.
  For each, select all of the chooser's memories whose share fits in what the demand leaves of
  the pie, and count them; a derived `payoff` is share × count; `select demand` with
  `maximize payoff` is the best reply, ties at random (as the coded tie-breaks). With the random
  strategy probability nothing is counted, so all three tie and the pick is uniform.
- **Play** (a rule): with a fair coin, select another bargainer; `cause` the choice on both,
  pass each the other's share (`heard`), then `cause` remember on both.

It reads well as a flow: the memory part is about 24 of the 66 acts, and each piece says what
it means (oldest, compatible, best). What is awkward is around it, below.

## Gaps hit, and how they were worked around

1. **Picking another agent of one's own kind without a space.** A select with no locating term
   can return the chooser (as Ascape's `findRandom`). Worked around with `minimize` of the
   constant `zero`: every candidate ties, and locating terms leave out the origin
   (the generators' `includeSelf = false`). Correct but obscure. A plain `other` term, or the
   core library's dropped `self` as a value for `different`, would say it directly.
2. **No argmax over values.** There is no function choosing the best of three evaluates, and
   a query cascade with random tie-breaks would take about 30 acts. The choices became agents,
   so `maximize` does it; their `compatible` count is scratch state reset before each choice.
3. **States are typed per attribute.** A bargainer's `demand` (state, for the chart) cannot be
   copied into a memory's state, nor set from the chosen demand agent's `level`. Memories hold
   a real `share`, the bargainer keeps `share` beside `demand`, and the chosen level is turned
   into the bargainer's state by three query and set pairs.
4. **A perform sees only its own agent** (D1), so the opponent's share is passed in through an
   attribute (`heard`) set just before `cause remember`. `cause` on the opponent's selection
   (same agent type) is what keeps the choice and memory written once, not twice.
5. **Exactly population/2 encounters per period** (Ascape's repeated draw,
   `agentsPerIteration`) has no execution setting. Each agent starts an encounter with a fair
   coin (`randomIs`), so the number per period is binomial with the same mean, and no agent
   starts two. The comparison below shows no difference.
6. **The simplex view is not expressible:** a nested scape cannot stand in a continuous space,
   and there is no move to computed coordinates (the roadmap's Pursuit gap). The model has the
   chart only.
7. **Small readings:** compatibility is "the two shares sum to at most 1" (the paper's rule),
   which the coded port hard-codes; the same at every payoff setting the figures use. Payoffs
   are doubles, not the coded port's 32-bit floats. Figure 3 needed a boolean parameter,
   `highLowStart`; with it both figures are run specs.

## Size

|                                                                      | lines | bytes  |
| -------------------------------------------------------------------- | ----- | ------ |
| `ClassesModelOne.model.json` (66 acts, 19 attributes, 3 agent types) | 568   | 18,299 |
| coded `bargaining.ts` (all nine models)                              | 648   | 22,048 |
| of that, what Model One uses (about)                                 | 330   | —      |

So about 1.7 times the coded lines for the one model, as formatted JSON.

## Statistical comparison

`model-one-format.test.ts`: 12 seeds, 60 periods, the share of agents making each demand
averaged over periods 31 to 60 (both settle within about 25). Pass if the means differ by less
than 4 standard errors of the difference and the standard deviations by less than a factor 3.
Mean (standard deviation across seeds):

| run       | demand | coded         | format        | difference | 4 SE  |
| --------- | ------ | ------------- | ------------- | ---------- | ----- |
| Model One | low    | 0.034 (0.005) | 0.033 (0.004) | 0.001      | 0.007 |
| Model One | medium | 0.931 (0.008) | 0.932 (0.007) | 0.002      | 0.012 |
| Model One | high   | 0.036 (0.007) | 0.035 (0.005) | 0.001      | 0.010 |
| Figure 3  | low    | 0.440 (0.008) | 0.442 (0.009) | 0.002      | 0.014 |
| Figure 3  | medium | 0.032 (0.005) | 0.032 (0.005) | 0.001      | 0.008 |
| Figure 3  | high   | 0.528 (0.011) | 0.527 (0.009) | 0.001      | 0.016 |

Model One reaches the equitable norm (medium about 1 − 2p/3 with p = 0.1); Figure 3 stays
fractious. The family's tests take about 7 seconds, nearly all the format runs.

## Timing

Default parameters, 200 periods after 20, three seeds: coded 0.044 ms per period, format
6.4 ms per period, about **150 times** slower. The cost is the recount: every choice reads
3 × m memories (m 20 to 100). Keeping per-bargainer counts by demand, updated on remember,
would make a choice read 9 agents instead, at the price of about ten more acts; not done, since
the recount is what the model says.

## Effort

About two hours: most reading the interpreter to confirm the semantics (nested scape search,
region queries, `maximize` ties, `cause` on another agent), and about twenty minutes writing
the file, which checked without diagnostics the first time. The comparison test took another
half hour.

## Not done here

- `npm run check` did not pass in the shared checkout, for reasons outside this family: prettier
  fails on the Civil Violence pilot's `packages/models/cv-*.tmp.ts`, and `@xmldom/xmldom` (a
  dependency of `packages/spec`) is not installed in the checkout's `node_modules`, so the spec
  typecheck and its three translation test files fail. Every other step passes: lint and
  typecheck of the other packages, every test in `packages/models` and the Studio build.
- The Studio catalogue manifest (`apps/studio/src/catalog/manifest.json`, with card pictures)
  lacks all three pilots' format models; it should be regenerated once
  (`UPDATE_CATALOG=1 npx vitest run apps/studio/src/catalog`) after they land.
- `fromMetaabm` is imported as `fromFormat`; it should move out of `amp/` under a neutral name.

## What this suggests for the other list-valued families

Memory as nested agents is workable and reads naturally; expect roughly half a day per family,
files of 500 to 700 lines, and slowdowns of about 100 times where a decision scans the list.

- **Coordination Game step 3 (last five partners):** the same ring buffer as here; reuse the
  pattern directly.
- **Sugarscape culture tags:** fixed-length booleans, so gap 3 does not arise. A tag is a
  nested agent with a `position`; flipping a neighbour's tag to match is "select one of my tags
  at random, then the neighbour's tag with the same position, set". Tribe is a count over all
  tags.
- **Spatial IPD chromosomes:** genes as nested agents with a `position`; reading the move for a
  history is a select by position, and a child's chromosome is made by creating genes in the
  child from each of the parent's (with mutation as a random query). Same pattern, more
  creates.

Each would hit gap 1 or 2 if it picks a partner or a best option without a space. Small core
library additions would remove the most awkward parts: an `other` term (or `self` as a value),
and a way to set one state attribute from another with the same option IDs.
