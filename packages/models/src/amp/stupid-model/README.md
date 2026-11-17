# StupidModel (Eclipse AMP examples)

Steps 1, 2, 3 and 5 of the StupidModel teaching series, from the Eclipse Agent Modeling Platform (AMP)
example models `StupidModel1.metaabm`, `StupidModel2.metaabm`, `StupidModel3.metaabm` and
`StupidModel5.metaabm` (there is no step 4 in AMP). Bugs live on a 100 x 100 periodic Moore grid of
habitat cells.

- Authors: Steven F. Railsback, Steven L. Lytinen and Volker Grimm.
- Citation: Railsback, S. F., Lytinen, S. L., & Grimm, V. (2005). StupidModel and extensions: A template
  and teaching tool for agent-based modeling platforms.
- Licence: EPL-2.0 (the AMP sources are EPL licensed).
- Copyright: none of the four `.metaabm` files carries a `description` or a copyright statement, so the
  fallback "Copyright (c) Metascape LLC and others, made available under the Eclipse Public License" is
  used.

The citation was given with the original port. The AMP sources do not state any author or publication;
the only descriptive text is the rule description in StupidModel1 ("Move to a neighboring space. (In this
version we also have to manually notify the bug's broker. :( )"). It does not contradict the citation:
the model names and the step structure (random movement, growth, food, consumption) match.

## Where the models come from

Each model is its `.metaabm` file, translated into the model format
(`packages/spec/examples/escape/*.model.json`, written by `npm run translate-examples`) and run by the
format's interpreter. Nothing in this folder describes behaviour.

| Model         | File                   | What the bugs and habitats do                                                                   |
| ------------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| StupidModel 1 | `StupidModel1.metaabm` | Bugs move to a random free cell within their vision.                                            |
| StupidModel 2 | `StupidModel2.metaabm` | As 1, and bugs grow by one each period; their colour fades from white to red with size.         |
| StupidModel 3 | `StupidModel3.metaabm` | As 2, and habitats produce food; bugs neither eat nor look for it.                              |
| StupidModel 5 | `StupidModel5.metaabm` | Habitats produce more food; each bug eats up to its maximum consumption and grows by that much. |

StupidModel 5's consumption is a method act whose body is Java in the original. It is ported by hand to
TypeScript in `packages/spec/examples/escape/StupidModel5.ports.ts`, which the translation puts in place
of the Java (R21 in `docs/metamodel-review.md`).

## What the catalogue adds

The originals gather no statistics but the number of bugs, which does not change. So that the charts
show something, `index.ts` also gathers bug size (steps 2, 3 and 5) and habitat food (steps 3 and 5), and
charts them. This only records values; it changes nothing in the run.
