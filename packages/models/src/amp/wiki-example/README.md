# Wiki Example (Eclipse AMP examples)

Ported from `WikiExample.metaabm` of the Eclipse Agent Modeling Platform example models. A bounded
(non-periodic) 20 x 20 Moore "city" holds 50 individuals with an age (0 to `maximumAge - 1`) and a
wealth (uniform in [0, 1)). Each tick, each individual, in shuffled order, looks within its vision (5,
Moore distance, itself excluded) for individuals of exactly its own age, picks one at random and moves
to a random free block next to that partner. Same-aged individuals therefore clump.

- Authors and citation: the sources state none, so `provenance` has neither.
- Licence: EPL-2.0.
- Copyright: the `.metaabm` has no `description` or copyright statement; the fallback "Copyright (c)
  Metascape LLC and others, made available under the Eclipse Public License" is used.

Initial rules, in order: "Initial State" (age and wealth), "Initial Movement" (random available block).
Rule: "Find Partner". Style: individuals are ovals coloured RGB(wealth x 255, 255, 255); blocks have no
style (a light grey is used).

## Legacy classes

| Legacy class                                                                              | New model or shared file          | Status                  |
| ----------------------------------------------------------------------------------------- | --------------------------------- | ----------------------- |
| `org.eclipse.amp.amf.examples.escape.WikiExample`                                         | `wiki-example.ts` (`wikiExample`) | ported                  |
| `Individual`                                                                              | `Individual` in `wiki-example.ts` | folded into shared code |
| `Block`                                                                                   | `Block` in `wiki-example.ts`      | folded into shared code |
| `SimpleDraw*`, `WikiExampleGraphicsAdapter`, `WikiExampleAdapterFactory`, `WikiExample3D` | view specs                        | not ported: UI only     |

## Deviations and kept oddities

- `maximumWealth` is a model attribute that nothing reads (default 0); it is kept as an inert parameter.
- Vision (5) is a per-agent attribute, not a model parameter, as in the file.
- Population is constant, so the legacy "Individuals Population" chart is flat. A "Same-age neighbour"
  series (share of individuals with a same-aged individual next to them) is added to make the clustering
  visible; it is not in the original.
- If the partner has no free neighbouring block, the individual stays put.
- Random number streams differ from Java.
