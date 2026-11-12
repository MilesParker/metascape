# Demographic Prisoner's Dilemma (AMP) (Eclipse AMP examples)

Ported from `DemographicPrisoner_sDilemma.metaabm` of the Eclipse Agent Modeling Platform example models.
The act graph of the model file is the authority: the escape project's generated `Player.java` is an
unfinished stub (placeholder text instead of spatial code), so the equivalent Java generated for the
sibling `...examples.ascape` project was consulted for the meaning of the spatial acts (the two
`.metaabm` files are identical).

- Authors: Joshua M. Epstein.
- Citation: Epstein, J. M. (1998). Zones of cooperation in demographic prisoner's dilemma. Complexity,
  4(2), 36-48. (Given with the task; the AMP sources themselves cite nothing.)
- Licence: EPL-2.0.
- Copyright: the `.metaabm` has no `description` or copyright statement; the fallback "Copyright (c)
  Metascape LLC and others, made available under the Eclipse Public License" is used.

100 players on a 20 x 20 periodic von Neumann grid, one per cell. Initial rules: "Initialize" (wealth =
`initialWealth`, age uniform below `maximumAge`, strategy a fair coin), "Move To Random Location". Rules per
tick, in order, each over all players in shuffled order:

1. Random Walk: step to a random available neighbour, if any.
2. Play Neighbor: play one randomly chosen neighbouring player; both receive their payoff (CC 2/2, a
   defector against a cooperator gets 6 and the cooperator -6, DD -5/-5).
3. Update Age: age + 1.
4. Fission Rule: if wealth >= `fissionWealth` (11) and a neighbouring cell is free, the child appears there
   with wealth `inheritedWealth` (6, taken from the parent), age 0 and the parent's strategy, or a random
   one with probability `mutationRate` (0.1). Children first act the next tick.
5. Die At Age: removed if age > `deathAge`.
6. Die At Wealth 0: removed if wealth < 0.

Style: players are ovals, blue for cooperators and red for defectors; cells green.

## Legacy classes

| Legacy class                                                                                                      | New model or shared file              | Status                  |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------- |
| `edu.brook.DemographicPrisonersDilemma`                                                                           | `demographic-pd.ts` (`demographicPd`) | ported                  |
| `Player`                                                                                                          | `Player` in `demographic-pd.ts`       | folded into shared code |
| `PlayCell`                                                                                                        | `PlayCell` in `demographic-pd.ts`     | folded into shared code |
| `CooperateDefectStyle*`, `PlayCellStyle*`, `*GraphicsAdapter`, `*AdapterFactory`, `DemographicPrisonersDilemma3D` | view specs                            | not ported: UI only     |

## Deviations and kept oddities

- `minimumWealth`, `maximumWealth` and `birthAge` are model attributes that no act reads; they are kept as
  inert parameters.
- The die rules run after the fission rule in the same tick, so a player that just gave birth can also die.
- The metaabm's "Other Player" selection is a random occupied neighbouring cell; with no neighbours no game
  is played (as in the Ascape-flavoured generated code).
- Wealth and age are integers (the payoffs and thresholds are).
- Random number streams differ from Java. Epstein's paper has further variants (movement rules, other
  neighbourhoods) that are not in this model file and are not ported.
