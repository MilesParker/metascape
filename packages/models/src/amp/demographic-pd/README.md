# Demographic Prisoner's Dilemma (AMP) (Eclipse AMP examples)

From `DemographicPrisoner_sDilemma.metaabm` of the Eclipse Agent Modeling Platform example models.
Players on a 20 x 20 periodic von Neumann grid each period take a random step, play one random
neighbour, age, have a child on a free neighbouring cell when wealthy enough (the child inherits the
strategy, or mutates), and die when too old or too poor.

- Authors: Joshua M. Epstein.
- Citation: Epstein, J. M. (1998). Zones of cooperation in demographic prisoner's dilemma. Complexity,
  4(2), 36-48. (Given with the original port; the AMP sources themselves cite nothing.)
- Licence: EPL-2.0.
- Copyright: the `.metaabm` has no `description` or copyright statement; the fallback "Copyright (c)
  Metascape LLC and others, made available under the Eclipse Public License" is used.

## Where the model comes from

The model is the `.metaabm` file, translated into the model format
(`packages/spec/examples/escape/DemographicPrisoner_sDilemma.model.json`) and run by the format's
interpreter. Epstein's paper has further variants (movement rules, other neighbourhoods) that are not
in this file.

The charts show the gathered statistics: players and cooperators, and mean wealth and age.
