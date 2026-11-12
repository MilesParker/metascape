# Norms

"Learning to be thoughtless": a ring of 191 agents. Each holds a binary norm (drive on the right or left) and a sampling radius. Agents adopt the majority norm among the agents within their radius, and adjust the radius incrementally. With little noise the norm locks in and the radii shrink, so that agents stop computing.

Citation: Epstein, J. M. (2001). Learning to be thoughtless: Social norms and individual computation. Computational Economics, 18(1), 9-24. The legacy About text credits Joshua M. Epstein (model) and Miles Parker (Java implementation, from Epstein's C++ model).

Collection: Brookings Institution models (from Ascape). Licence: BSD (`LICENSES/brookings-models-license.txt`), ported under EPL-2.0.

| legacy class            | new model or shared file | status                  |
| ----------------------- | ------------------------ | ----------------------- |
| `edu.brook.norms.Norms` | `norms.ts` (`norms`)     | ported                  |
| `Norms.NormCell`        | `norms.ts` (`NormCell`)  | folded into shared code |

## Parameters

`ambientNoise` (0.03), `tolerance` (0.05), `initMaxRadius` (10): the legacy bean properties. `lockIn` (default off) selects the documented alternative initial condition of Figure 1 in the paper (all agents start with norm 0), which the legacy code carries as a commented line.

## Mapping notes

- The ring is a 1 x 191 wrapped strip in a `GridScape`. Ascape's one-dimensional `findWithin` (`ListBase.findWithinImpl`) returns the cells within circular distance `d`, or the whole ring when `2d+1` covers it; `GridScape.within` with the chebyshev metric gives the same set. Radius 0 (for the `radius - 1` sample) is the agent itself.
- The scape runs with `REPEATED_DRAW`: each tick, 191 agents are drawn with replacement and act immediately (`sampling: 'draw'`).
- Sampled cell lists are recomputed whenever the radius is set, as in the legacy `findNearCells`.
- Legacy scrolling one-dimensional history views have no counterpart; the strategy and radius strips show the current state only.

## Deviations and kept legacy quirks

- Kept: the second branch of the radius rule (`avgMinus >= avg - tol || avgMinus <= avg + tol`) is always true, so the radius shrinks whenever it does not grow.
- Kept: the legacy statistics named "Yellow" and "Blue" count norm 0 and norm 1 respectively, while the cells are drawn blue for norm 0. The series here are `strategy0` and `strategy1`.
- Kept: `includeSelf`, `strategyFixed`, `radiusFixed` exist in the legacy class but never affect the rules.
- Not ported: the other commented alternatives. The "noise shock" (noise only in iterations 145-154) and the fixed-strategy / fixed-radius agents are fragments with hard-coded numbers and, for the fixed agents, flags the update rules never read, so they are not exposed.
- The ring size 191 is private in the legacy class and is not a parameter. `initMaxRadius` is limited to at least 1 (Java's `nextInt(0)` would throw).
- Random streams differ from Java's; runs are deterministic per seed only.
