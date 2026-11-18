# @metascape/spec

Models as data: a typed, declarative model format, a checker, and an interpreter that runs a
model on the Metascape engine.

- `@metascape/spec` (`src/metamodel/`): the format, which follows the MetaABM metamodel of the
  Eclipse Agent Modeling Platform (AMP) closely, so that AMP's `.metaabm` models are carried over
  as they are. It has its types and Zod schemas, a checker, the core function library as data with
  an implementation of every function, and the interpreter (`compileModel`), which turns a model
  into an engine model. See [docs/metamodel-review.md](../../docs/metamodel-review.md).
- `@metascape/spec/metaabm` (`src/metaabm/`): the translation from AMP's `.metaabm` files into the
  format, and the AMP examples it is tested on (`examples/`).

## The format

A model is its root scape. A scape holds agents (which may be scapes) and spaces; agents hold
attributes, acts and styles. Acts form a graph: each act lists the acts its flow goes on to
(`targets`) and names the selection it works within (`selected`). Every flow starts at a root
act, such as a rule or an initialize.

References are paths of IDs that follow the nesting, so an ID only has to be unique among its
siblings. Agents, spaces and attributes are written as their path from the root scape (`bug`,
`grid2D`, `bug.energy`, `region.farmer.wealth`, or `bugCount` for an attribute of the root scape);
acts as their path within their agent's acts (`bugRule`, or `moves.step` in a group). Functions
and constants (`unit`, `true`) are referred to by their ID in the function library.

```ts
import { checkModel, compileModel, parseModel, type Model } from '@metascape/spec';

const model: Model = parseModel(JSON.parse(text)); // shape only
const diagnostics = checkModel(model); // references, flows, function inputs, selections
const engineModel = compileModel(model); // run it with the engine's RootScape
```

`types.ts` is the definition of the format; `schema.ts` validates input against it and gives a
JSON Schema (`modelJsonSchema()`); `check.ts` checks meaning; `core-library.ts` is the core
function library; `interpreter.ts` and the files beside it run a model. In `examples/`,
`life.ts`, `schelling.ts` and `forager.ts` are models written for Metascape (`examples`), and
`stupid-model-1.ts` is AMP's StupidModel 1, written by hand as a test of the translation.

## Building one model on another

A model file can build on others. Both kinds are resolved when the file is loaded, by
`resolveModel(file, { bases })`, into one flat model; the checker and the runtime never see an
overlay or a type that extends another, so what a model does can be read from the one model it
becomes. (Owner, 2026-11-18.) `parseModel` and `compileModel` refuse an unresolved file.
`fromMetaabm` in `packages/models` resolves a file given the files of its bases.

**Overlays.** A file with an `extends` names a base model (by its `id`) and holds only its own
`id`, optionally a `label`, `pluralLabel` and `description`, and what it changes, each addressed by a
path of IDs from the root of the base file:

```json
{
  "schemaVersion": 2,
  "id": "sugarscapeII2",
  "extends": "sugarscapeII1",
  "label": "Sugarscape II-2",
  "description": "As II-1, but sugar grows back one unit per period.",
  "remove": ["agents.sugarCell.acts.toCapacityAtOnce"],
  "replace": { "agents.sugarCell.acts.growBack": { "kind": "rule", "targets": ["oneMore"] } },
  "add": { "agents.sugarCell.acts.oneMore": { "kind": "evaluate" } }
}
```

- `remove` (a list of paths), then `replace` and `add` (objects from path to value), in that order,
  each in the order written. A path names an object key at any depth (`attributes.rate.default`,
  `agents.counter.acts.tick.targets`); an array is replaced whole, never indexed.
- `replace` needs the path to exist and keeps the element's place among its siblings. `add` needs
  the path's parent to exist and the path itself not to, and puts the element last. This is
  deliberate: a misspelt path is an error, not a new element. To move an element, remove it and add
  it again.
- An overlay can be the base of another, to any depth. Its own `id` replaces the base's; the label,
  plural label and description are the base's unless the overlay gives them. Language and schema
  version are the base's.
- A model written into an overlay instead of under `add` or `replace` is an error.
- Errors in an overlay (a base that is not given, a cycle, a path that is not there, is there
  already, or is malformed) are thrown as a `ModelFormatError` whose diagnostics carry the overlay's
  model ID as `file` and the path in the overlay (`replace["agents.sugarCell.acts.nope"]`). What the
  merged model gets wrong is found by the checker, in the merged model's own paths.

**Agent types that extend others.** An agent has an optional `extends`, the path of another agent
type (`"extends": "person"`, `"region.farmer"`), and an optional `abstract`:

- It inherits its parent's `attributes`, `acts` and `styles`, then adds its own. The same ID replaces
  the inherited element, in its place (so a child's act list is the parent's order, then new acts);
  an act's targets are its own, so a child that needs more targets replaces the act. A group is
  one element: replacing a member means replacing the group. There is no removing an inherited
  element. `execution` merges field by field, so a child can set `rules` to put an inherited rule in
  its place in the order.
- The label, plural label and description are the child's alone.
- What an inherited act or style names of the parent's attributes and options (`person.energy`,
  `person.mood.calm`) becomes the child's (`citizen.energy`), because they are written for the
  type they are inherited from. Agents, spaces and acts are not rewritten.
- `abstract: true` means the type is only to be inherited from: it is not in the flat model. Other
  parents stay as types of the model. Chains work; a cycle is an error.
- **A selection of a type does not find its subtypes.** After resolution the types are unrelated:
  selecting `person` finds persons only (and nothing at all if `person` was abstract), never
  citizens and cops. For the science it must be plain when behaviour changes. Say so in the
  parent's `description`.
- Only agent types extend; scapes do not.

Overlays are resolved first, on the files as written, and agent types after, on the merged model,
so an overlay can replace an act of a type that others inherit from and its children follow. Not
done: a JSON Schema for the overlay and `extends` forms (`modelJsonSchema()` describes the flat
model only); naming the file by anything but the model's ID.

## Translating `.metaabm` files

```ts
import { translateMetaabm } from '@metascape/spec/metaabm';
import { checkModel } from '@metascape/spec';

const { model, diagnostics } = translateMetaabm(text); // model is undefined if it can't be translated
if (model) checkModel(model);
```

The translation reads the XMI with `@xmldom/xmldom`, a plain JavaScript XML parser that gives the
same result in Node and in the browser, with no dependence on the browser's own `DOMParser`.
`diagnostics` lists everything the translation dropped, defaulted, moved or could not translate,
each with the XMI path of the element. `examples/` holds the twelve Escape examples with their
translations, generated by `npm run translate-examples`; see `examples/README.md`.

## Provenance

The format is derived from the MetaABM metamodel. It began as "score", a component of Repast
Simphony contributed under the Eclipse Public License by Argonne National Laboratory; it was
developed by Metascape from 2007 as MetaABM, and contributed to Eclipse as part of the Agent
Modeling Platform in 2009. The core function library is translated from AMP's
`core_library.metaabm`. Both were made available under the Eclipse Public License; this package
is distributed under EPL-2.0.
