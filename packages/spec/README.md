# @metascape/spec

Models as data: a typed, declarative model format, a checker, and an interpreter that runs a
model on the Metascape engine.

The package holds two formats while one replaces the other:

- `@metascape/spec` (`src/*.ts`): the current format, which Studio runs, with five examples.
- `@metascape/spec/metamodel` (`src/metamodel/`): the new format, which follows the MetaABM
  metamodel of the Eclipse Agent Modeling Platform (AMP) closely, so that AMP's `.metaabm` models
  can be carried over as they are. It has its types and Zod schemas, a checker, and the core
  function library as data. The interpreter and the `.metaabm` translation come next; see
  [docs/metamodel-review.md](../../docs/metamodel-review.md).

## The new format

A model is its root scape. A scape holds agents (which may be scapes) and spaces; agents hold
attributes, acts and styles. Acts form a graph: each act lists the acts its flow goes on to
(`targets`) and names the selection it works within (`selected`). Every flow starts at a root
act, such as a rule or an initialize.

```ts
import { checkModel, parseModel, type Model } from '@metascape/spec/metamodel';

const model: Model = parseModel(JSON.parse(text)); // shape only
const diagnostics = checkModel(model); // references, flows, function inputs, selections
```

`types.ts` is the definition of the format; `schema.ts` validates input against it and gives a
JSON Schema (`modelJsonSchema()`); `check.ts` checks meaning; `core-library.ts` is the core
function library. `examples/stupid-model-1.ts` is AMP's StupidModel 1, written by hand.

## Provenance

The new format is derived from the MetaABM metamodel. It began as "score", a component of Repast
Simphony contributed under the Eclipse Public License by Argonne National Laboratory; it was
developed by Metascape from 2007 as MetaABM, and contributed to Eclipse as part of the Agent
Modeling Platform in 2009. The core function library is translated from AMP's
`core_library.metaabm`. Both were made available under the Eclipse Public License; this package
is distributed under EPL-2.0.
