# Coordination Game (Ascape manual tutorial)

The five steps of the tutorial of the Ascape manual, `edu.brook.manual.model1` to `model5`. Players on a 30 x 30 lattice take random steps and play a coordination game with a randomly chosen neighboring player: if both have the same colour, the player scores that colour's payoff (red score or blue score, both 1 by default). Each player remembers its last five scores. The steps differ in how a player revises its colour:

1. Imitation of the best-scoring neighbor (once more than five plays or updates have happened).
2. As step 1, with an error: with a given chance (in 101) the player picks a colour at random. Adds the payoff statistic and chart.
3. Best reply to the colours of the last five partners, random on ties or error.
4. No revision; players with a recent score exactly equal to the reproduction score have an offspring of the same colour next to them, and players at or below the minimum score after enough plays die.
5. As step 2, but imitating four random friends anywhere on the lattice instead of neighbors (no births or deaths).

The legacy sources state no author or citation; none is given. Provenance note: "The tutorial models of the Ascape manual."

Collection: Brookings Institution models (from Ascape). Licence: BSD (`LICENSES/brookings-models-license.txt`), ported under EPL-2.0.

| legacy class                    | new model or shared file          | status                  |
| ------------------------------- | --------------------------------- | ----------------------- |
| `model1.CoordinationGame`       | `steps.ts` (`step1`)              | ported                  |
| `model1.CoordinationGamePlayer` | `coordination-game.ts` (`Player`) | folded into shared code |
| `model2.CoordinationGame`       | `steps.ts` (`step2`)              | ported                  |
| `model2.CoordinationGamePlayer` | `coordination-game.ts` (`Player`) | folded into shared code |
| `model3.CoordinationGame`       | `steps.ts` (`step3`)              | ported                  |
| `model3.CoordinationGamePlayer` | `coordination-game.ts` (`Player`) | folded into shared code |
| `model4.CoordinationGame`       | `steps.ts` (`step4`)              | ported                  |
| `model4.CoordinationGamePlayer` | `coordination-game.ts` (`Player`) | folded into shared code |
| `model5.CoordinationGame`       | `steps.ts` (`step5`)              | ported                  |
| `model5.CoordinationGamePlayer` | `coordination-game.ts` (`Player`) | folded into shared code |

## Mapping notes

- Ascape runs the players by rule, each rule over all players before the next: random walk, update, play (steps 1, 2, 3, 5); random walk, play, metabolism (step 4). The walk and play rules are visited in a fresh random order, update and metabolism in creation order. The engine has one visiting order per scape, so a small driver scape named `Schedule` (one agent) runs these passes over the players in the legacy order (`addPasses` in `coordination-game.ts`). This is an engine gap: per-rule visiting order.
- Players are placed on random empty cells at the start (the legacy initial rule `MOVE_RANDOM_LOCATION_RULE`). The lattice is a torus with von Neumann neighborhoods. A random walk picks one of the four neighbor cells and moves only if it is empty. Playing picks one occupied neighboring cell at random, and only the active player scores.
- Parameters: `nPlayers` (100), `redScore` (1), `blueScore` (1) in all steps; `error` (0) in steps 2, 3 and 5; `turnsToDie` (5), `repScore` (5), `minDieScore` (3) in step 4. Legacy names `getTurnstoDie`, `getrepScore`, `getMinDieScore` are normalized. `friends_size` (4) is a public field without accessors, so it is a constant.
- Views: the lattice (green cells, red and blue players), a chart of reds, blues and average payoff (payoff is `10 * recent score`, from step 2), bars, and for step 5 a network view of the friend links (the legacy `setDrawNetwork(true)`).

## Deviations and kept legacy behaviour

- Parameters with no effect in a step are omitted: `error` in steps 1 (no such property) and 4, and the step 4 settings in step 5, although the legacy beans exist. Step 1 has no error at all; it equals step 2 with error 0.
- Kept: the update rule increments `count` as well as each play, so players start revising after about three rounds, not five.
- Kept: step 4 leaves `totalScore` unchanged after reproduction (only the first four remembered plays are zeroed), and the offspring starts with its parent's `totalScore` until it plays. So a parent can reproduce again straight away if it does not play (no neighbor).
- Kept: step 5 friends are drawn with replacement from all players, so a player can have repeated friends or itself as a friend. They are never changed. The friend network view skips duplicates and self links.
- Kept: errors are "in 101": the legacy test is `randomInRange(0, 100) >= error`, which is inclusive, so even with `error = 100` a player revises by the rule with probability 1/101.
- Offspring added during a tick (step 4) first act in the next tick (engine rule); the Ascape strategy for mutable scapes was not examined in detail.
- Legacy players placed beyond the 900 lattice cells are killed; here `nPlayers` is limited to 900.
- Random streams differ from Java's; runs are deterministic per seed only.
