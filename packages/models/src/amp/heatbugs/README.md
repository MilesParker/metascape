# Heatbugs (AMP) (Eclipse AMP examples)

From `Heatbugs.metaabm` of the Eclipse Agent Modeling Platform example models. 100 heat bugs on a
100 x 100 bounded Moore grid. Heat diffuses over the grid and evaporates; each bug adds its heat to the
cell it is on and moves to the free neighbouring cell that is hottest, if its cell is colder than its
ideal temperature, or coldest otherwise. Unhappiness is how far a bug's cell is from its ideal.

- Authors and citation: the sources state none, so `provenance` has neither.
- Licence: EPL-2.0.
- Copyright: the `.metaabm` has no `description` or copyright statement; the fallback "Copyright (c)
  Metascape LLC and others, made available under the Eclipse Public License" is used.

## Where the model comes from

The model is `Heatbugs.metaabm`, translated into the model format
(`packages/spec/examples/escape/Heatbugs.model.json`) and run by the format's interpreter.

The original gathers the bugs' unhappiness. `index.ts` also gathers the cells' heat, and charts both;
this only records values.
