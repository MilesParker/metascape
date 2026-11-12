# Simple

The smallest of the Ascape example models. One agent (behaviour 0) doubles its happiness every tick up to a ceiling of 1000; every other agent has a one in ten chance per tick of resetting that agent's happiness to 3. The chart shows the maximum happiness.

Source: Ascape 5.6.1, `edu.brook.Simple`. The sources state no author and no citation, so none is given. Collection: Brookings Institution models (from Ascape). Licence: BSD (`LICENSES/brookings-models-license.txt`), ported under EPL-2.0.

| legacy class  | new model or shared file    | status                  |
| ------------- | --------------------------- | ----------------------- |
| `Simple`      | `simple.ts` (`simple`)      | ported                  |
| `SimpleAgent` | `simple.ts` (`SimpleAgent`) | folded into shared code |

## Deviations and kept behaviour

- The lattice (30 x 30, von Neumann) is created and shown, but, as in the legacy model, agents are never placed on it (the `initialize` that would do so is commented out in `CellOccupant`), so it stays empty.
- Legacy bug not reproduced: `SimpleAgent` numbers its behaviours with a `static` counter that is never reset, so a second run in one JVM has no behaviour 0. Here the counter belongs to the run.
- Legacy `System.out` printing is dropped.
- Only `numberOfAgents` is a parameter; the lattice size is private in the legacy class.
- Rules run by rule, in creation order (`UPDATE_RULE` is not random), so agent 0 acts before the others each tick.
