# AMP example models

The `.metaabm` files here are models of the Eclipse Agent Modeling Platform (AMP), copied unchanged
from the AMP repository (https://github.com/MilesParker/amp, commit 7b675a9e, 2013-01-28), where
they were made available under the Eclipse Public License. They are distributed under EPL-2.0
(see `NOTICE` at the root of this repository). Their names are the original names.

- `escape/`: the twelve examples of `org.eclipse.amp.amf/examples/org.eclipse.amp.amf.examples.escape`
  (Epidemic and its variants, Heatbugs, Markets, the Demographic Prisoner's Dilemma, StupidModel
  1, 2, 3 and 5, and the Wiki example). The Escape copies are the source of truth: the Ascape and
  Repast copies of the same examples differ a little and are not used.
  Beside each is its translation into the Metascape model format, `Name.model.json`, and the
  diagnostics of the translation, `Name.diagnostics.json` (each with the XMI path of the element
  concerned). Both are generated; do not edit them. A method whose body is Java in the original
  is ported by hand to TypeScript in `Name.ports.ts`, keyed by the XMI path of its method act, and
  the translation takes the port in place of the Java (`ports.ts` lists the ports). StupidModel 5's
  `ConsumeFood` is the one there is.
- `tests/`: the models of `org.eclipse.amp.amf/tests/org.eclipse.amp.amf.gen.test`, which test the
  translation (`TestBasics`, `TestMovement` and `TestSpatial`).
- `sd/SIR.metaabm`: from `org.eclipse.amp.amf/examples/org.eclipse.amp.amf.examples.sd`. It uses the
  system dynamics extension, which is not ported, so the translation reports it as unsupported.

To translate again after changing the translation, run

```bash
npm run translate-examples
```

and `npm run translate-examples:check` (which the tests also do) fails if the committed files are out
of date.
