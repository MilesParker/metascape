# Wiki Example (Eclipse AMP examples)

From `WikiExample.metaabm` of the Eclipse Agent Modeling Platform example models. A bounded 20 x 20
Moore "city" holds 50 individuals with an age and a wealth. Each period each individual looks within its
vision for individuals of exactly its own age, picks one at random and moves to a free block next to it.
Same-aged individuals therefore clump.

- Authors and citation: the sources state none, so `provenance` has neither.
- Licence: EPL-2.0.
- Copyright: the `.metaabm` has no `description` or copyright statement; the fallback "Copyright (c)
  Metascape LLC and others, made available under the Eclipse Public License" is used.

## Where the model comes from

The model is `WikiExample.metaabm`, translated into the model format
(`packages/spec/examples/escape/WikiExample.model.json`) and run by the format's interpreter.

The original gathers only the number of individuals, which does not change, so the model has no chart.
The earlier code port added a "same-age neighbour" measure; it was not part of the model and is gone.
