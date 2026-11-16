# The model format, taken from the MetaABM metamodel

Status: draft for review, 2026-11-16. Nothing here is implemented yet.

## Why

The AMP example models were ported as TypeScript code, so the models built in MetaABM survive only as
code. The current `@metascape/spec` format can't hold them: it was designed separately and is
missing much of what MetaABM has. The plan:

1. Carry the MetaABM metamodel (`legacy/amp/.../acore/src/model/metaabm.ecore`, with the modeller
   guide in `legacy/amp/org.eclipse.amp/doc`) over into `@metascape/spec`, close to one to one.
2. Write a model-to-model translation from `.metaabm` (XMI) to the new format. When the metamodels
   correspond, this is mechanical.
3. Rewrite the interpreter (`compileModel`, which turns a model into closures run on the engine once,
   without generating code) for the new metamodel.
4. Import the AMP examples. The `.metaabm` files are the source of truth. The code ports in
   `packages/models/src/amp` are deleted, not compared against.

This replaces the current format; it does not extend it. The current format is a nested,
statement-style language (`set`, `let`, `if`, `forEach`, expression trees). MetaABM is a graph of
acts that selections flow through. The two don't sit well together, and the second is what the
models are written in.

Items marked **R1**, **R2** and so on need your review. They are collected, with a recommendation
for each, under [Review items](#review-items).

## Representation

- **Containment is nesting**, as in the ecore: a context holds its agents, projections and
  attributes. Contexts can be nested inside contexts.
- **Every element is keyed by its MetaABM `ID`.** Records are keyed by ID, so `label`,
  `pluralLabel` and `description` stay plain fields.
- **Cross-references are typed IDs**, resolved and checked by the checker. In XMI they are paths
  (`//@agents[ID='bug']/@rootActivity/@members[ID='bugRule']`). In the new format, an act refers to
  another act in the same agent by its bare ID, and to an attribute by `agent.attribute` (**R1**).
- **Only one side of each two-way reference is stored.** The ecore keeps both sides
  (`sources`/`targets`, `owner`/`attributes`); the format keeps `targets` and the containment side,
  and the checker derives the other side.
- **Derived, transient and volatile features are not stored** (`allAgents`, `allContexts`,
  `accessors`, `availableTypes`, `rootSelected`, `allSources`, `allTargets`, `reference`, and every
  derived feature of `SImplementation`).
- **Names drop the ecore prefixes** (`SAgent` → agent, `AQuery` → query, `FFunction` → function)
  (**R2**).

## Structure

| MetaABM                                                        | New format                                                                                             | Notes                                                                                                                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IID` (`label`, `ID`)                                          | key + `label`                                                                                          | IDs are unique model-wide in MetaABM, but in practice act IDs repeat across agents (`rootActGroup`, `bugRule`) (**R1**).                                                                      |
| `SNamed` (`pluralLabel`, `description`)                        | same fields                                                                                            |                                                                                                                                                                                               |
| `SAttributed.attributes`                                       | `attributes` record                                                                                    |                                                                                                                                                                                               |
| `SAttribute`                                                   | attribute: `type`, `default`, `gatherData`, `units`, `immutable`, `derived`                            | `defaultValue` is a string in the ecore; the format stores a typed literal. The current format's `initial` expression goes, since initial values are set by Initialize acts.                  |
| `SAttributeType`                                               | `boolean`, `integer`, `real`, `symbol`                                                                 | `UNDEFINED` and `NUMERIC` are only for function prototypes (polymorphic arguments); models may not use them. `symbol` is new compared with the current format (8 uses in the examples).       |
| `SAttributeArray` (`size`)                                     | attribute with `size`                                                                                  | All 22 uses in the examples are the automatic "Dimensions" array of a grid (**R3**).                                                                                                          |
| `SState`, `SStateValue`, `defaultOption`                       | state attribute with `options` (each labelled and described) and `defaultOption`                       |                                                                                                                                                                                               |
| Context attributes                                             | the model's parameters                                                                                 | In MetaABM a context's attributes are its parameters. The current format's separate `parameters` block goes. Its `min`/`max` (used by Studio's sliders) have no MetaABM counterpart (**R4**). |
| `SAgent` (`attributes`, `rootActivity`, `styles`, `children`)  | agent: `attributes`, `acts`, `styles`, `extensions`                                                    | `rootActivity` is always an `AGroup` whose `members` are the acts; the format flattens it to `acts` (**R5**).                                                                                 |
| `SContext` (`agents`, `projections`, `valueLayers`, `library`) | context: everything an agent has, plus `agents` (which may include contexts), `projections`, `library` | The root of a model is a context, as in Ascape where the model is the root scape. Nesting fixes the "agents that own their own scapes" gap (EpidemicRegional).                                |
| `SProjection`                                                  | projection, with `attributes`                                                                          | Projections have attributes, which hold their sizes (`width`, `height`).                                                                                                                      |
| `SNDimensional` (`dimensionality`, `borderRule`)               | `dimensionality`, `borderRule`                                                                         |                                                                                                                                                                                               |
| `SBorderRule`                                                  | `sticky`, `periodic` (plus `strict` and `bouncy`?)                                                     | The guide calls Strict and Bouncy obsolete, yet 4 example grids use `STRICT`. It also describes an "APeriodic" rule that isn't in the enum, which is presumably `STICKY` (**R6**).            |
| `SContinuousSpace`                                             | continuous space                                                                                       |                                                                                                                                                                                               |
| `SGrid` (`multiOccupant`, `neighborhood`)                      | grid                                                                                                   | `neighborhood`: `euclidean`, `moore`, `vonNeumann`. Euclidean is new compared with the current format.                                                                                        |
| `SNetwork` (`directed`)                                        | network                                                                                                |                                                                                                                                                                                               |
| `SGeography`                                                   | geography                                                                                              | Not used by any example. Kept in the format; the interpreter rejects it for now (**R7**).                                                                                                     |
| `SValueLayer`                                                  | —                                                                                                      | Only a name, unused (**R7**).                                                                                                                                                                 |
| `SStyle`, `SStyle2D`, `SStyleShape` (`shape`), `SStyle3D`      | style, with its own `acts`                                                                             | A style is actable: a rule whose acts evaluate colour, shape and fill (**R8**).                                                                                                               |
| `SImplemented`, `SImplementation`, `SImplementationMode`       | —                                                                                                      | Java package, class and paths for code generation. Dropped (**R9**).                                                                                                                          |
| `IModelExtension`, `IAgentChild`, `IAttributeChild`            | `extensions`                                                                                           | Extension points. The only user is the system dynamics extension (`sd.ecore`), in the SIR example (**R10**).                                                                                  |

Membership in projections comes from the builder acts, not from the agent. `ABuildGrid.agents`
lists the agents that may occupy a grid and `fillAgent` its cells; `ABuildNetwork.agents` and
`ABuildSpace.agents` work the same way. So an agent can be in a grid and a network at once, which
fixes that gap. The current format's `agent.space` and `as: cell | occupant` go.

## Functions

| MetaABM                                              | New format                    | Notes                                                                                                                                                                                                                              |
| ---------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FLibrary` (`functions`, `subs`)                     | function library, as data     | The built-in functions are themselves a MetaABM model, `core_library.metaabm`. That moves over as the core library, with each function's arguments and outputs declared as data and its implementation in TypeScript, keyed by ID. |
| `FFunction.inputPrototypes`                          | `inputs`                      |                                                                                                                                                                                                                                    |
| `FArgumentPrototype` (type, `optional`)              | input or output prototype     |                                                                                                                                                                                                                                    |
| `FArgumentArrayPrototype`, `FMultiArgumentPrototype` | array and variadic prototypes |                                                                                                                                                                                                                                    |
| `FOperator` (`symbol`), `FLogicalOperator`           | operator                      | `arity` is derived.                                                                                                                                                                                                                |
| `FGenericFunction` (`outputPrototypes`)              | function with outputs         | Some functions have more than one output (`location2D` gives X and Y) (**R11**).                                                                                                                                                   |
| `FGenericLogical`                                    | logical function              | Boolean result; what queries use.                                                                                                                                                                                                  |
| `FImplementedLibrary`, `SContext.library`            | — for now                     | User libraries implemented in Java. None of the examples has one (**R9**).                                                                                                                                                         |

A sink's `function` is a reference into the library, written by ID (`"available"`, `"within"`). In
XMI it is an `href` into `core_library.metaabm`.

The examples use 44 functions. The ones that matter most are `identical` (81 uses), `available`
(51), `add` (48), `graphicFill` (39), `neighbor` (30), `lesser` (28), `shapeOval`, `randomUnit`,
`randomInRange`, `sub`, `shapeRectangle`, `different` and `within`. The rest are used once to fifteen
times each. Notable among them are `uniformAdditiveDistribution` (7), `randomIs` (6), `timeNow`
(10), `nearest`, `toward`, `minimize`, `maximize` and `randomState` (**R12**).

## Acts

The act graph moves over as it is: each agent has a record of acts keyed by ID. Every act lists its
`targets` and names the selection it works within (`selected`).

| MetaABM                                                                          | New format                                              | Notes                                                                                                                             |
| -------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `AAct` (`targets`, `selected`, `group`)                                          | act: `targets`, `selected`                              | `group` is the containing `AGroup`; flattened (**R5**).                                                                           |
| `AGroup` (`members`)                                                             | the `acts` record                                       | Only ever used as the root container in the examples.                                                                             |
| `ASelect` (`agent`, `space`, `for`)                                              | select                                                  | `for` (`ONE`/`ALL`) is obsolete: cardinality is set by query terms instead (**R13**).                                             |
| `ARule`                                                                          | rule                                                    | Once per agent per period. The guide calls the order of rules "technically undefined" (**R14**).                                  |
| `ASchedule` (`start`, `interval`, `priority`, `pick`)                            | schedule                                                | Not used in the examples; `pick` is marked as likely to be replaced.                                                              |
| `ABuild`                                                                         | build                                                   | Once per context, before any initialize.                                                                                          |
| `AInitialize`                                                                    | initialize                                              | Once per agent at the start (**R15**).                                                                                            |
| `AWatch` (`attribute`)                                                           | watch                                                   | Fires whenever the attribute is set, even to the value it already has. 6 uses, in the Epidemic family (**R16**).                  |
| `ADerive` (`attribute`)                                                          | derive                                                  | Computes a derived attribute; its value is the last evaluate on the path. 4 uses (**R16**).                                       |
| `ADiffuse` (`diffused`, `diffusionRate`, `evaporationRate`)                      | diffuse                                                 | A root act with no targets. Fixes the two-phase diffusion gap (Heatbugs) (**R17**).                                               |
| `APerform`                                                                       | perform                                                 | Runs only when a cause names it.                                                                                                  |
| `ACause` (`result`)                                                              | cause                                                   | Runs a root act on the current selection. Recursion is allowed. 1 use.                                                            |
| `AQuery`                                                                         | query: `function`, `inputs`                             | A sink and a control.                                                                                                             |
| `AAll`, `AAny`, `ANone`                                                          | all, any, none                                          | Intersection, union and difference (**R18**).                                                                                     |
| `AEvaluate`                                                                      | evaluate: `function`, `inputs`                          | A sink whose value flows to its targets.                                                                                          |
| `ASet` (`attribute`, `parameter`)                                                | set                                                     | `parameter` is a value: an attribute, a literal, or an evaluate.                                                                  |
| `AMove`, `ALeave`, `ADie` (`destination`)                                        | move, leave, die                                        | `destination` is a select. For leave and die the guide says it is irrelevant (**R19**).                                           |
| `AConnect` (`within`, `directed`), `ADisconnect`, `AReplace`                     | connect, disconnect, replace                            | `replace` covers "clear all links of an agent, then connect".                                                                     |
| `ACreateAgents` (`agentCount`)                                                   | create                                                  | A kind of select, so later acts can work on the new agents.                                                                       |
| `ACreateShapedAgents`, `ALoadAgents`, `ALoadShapedAgents` (`shape`, `sourceURL`) | kept in the format, rejected by the interpreter for now | Not used by the examples (**R7**).                                                                                                |
| `ABuildGrid` (`agents`, `fillAgent`, `projection`)                               | build grid                                              |                                                                                                                                   |
| `ABuildSpace` (`spaceType`)                                                      | build space                                             | `spaceType` is deprecated (**R20**).                                                                                              |
| `ABuildNetwork` (`networkType`)                                                  | build network                                           | `networkType` is deprecated, and never set in the examples: every file takes the default, `Barabasi`, without using it (**R20**). |
| `ABuildGeography`                                                                | build geography                                         | Unused (**R7**).                                                                                                                  |
| `AMethod` (`body`, `generate`)                                                   | method                                                  | A Java method body. Used twice: `ConsumeFood` in both copies of StupidModel5 (**R21**).                                           |
| `AInput` (`selected`, `value`, `literal`)                                        | input: a value read from a selection                    | `selected` says whose attribute is read, which is how selections are "woven" through a flow.                                      |
| `ALiteral` (`valueLiteral`), `AMultiValue` (`values`)                            | literal, multi-value                                    | A multi-value lists the state attributes a distribution varies by (**R22**).                                                      |
| `AShaped`                                                                        | `shape` on create                                       |                                                                                                                                   |

## Execution semantics the interpreter needs

The ecore defines structure only. Behaviour is described in the modeller guide and, in the end, by
the code generators (`org.eclipse.amp.amf.gen.*`). The Escape generator reuses the Ascape
generator's selection code (`gen.ascape/.../ScapeAspect.xpt`, `inferascape.ext`), so for selections
the two agree.

Acts are a dataflow language, and the semantics are stated in those terms. The interpreter may
compute them however it likes, as long as the result is the same.

- **Edges carry data, not control.** An edge from one act to another carries a flow of agents, each
  with the context of its path: every selection made upstream on that path, still bound and
  readable ("weaving"). There is no statement order and no program counter. An act fires for each
  item that reaches it.
- **A root act is a source.** A rule emits every agent of its type, once per period. Initialize,
  build, schedule, watch, derive and perform emit when their trigger happens.
- **A select plus its queries describes a set declaratively.** The select names the agent type and
  the space; the queries attached to it are constraints on that set. `within`, `neighbor`, `here`,
  `available` and `includeSelf` say where to look, and other logical functions (`identical`,
  `lesser`, ...) say what qualifies. Whether this is computed as one search of the space or as a
  filter is an implementation choice; the generators compiled it into a single `find…` call on the
  space (for example `findRandomAvailableNeighbor`).
- **A selection's cardinality is also a query term.** With no cardinality term, a select yields one
  agent chosen at random from the set. `nearest` yields the nearest, `minimize` and `maximize` the
  one with the extreme value of an input, and `all` yields every member of the set, each flowing on
  separately to the targets (in the generators: `findIsList`, a loop over `find…` results).
- **Logic acts are set operations on flows.** `all` (intersection) passes what reaches it along
  every incoming path, `any` (union) what reaches it along at least one, without duplicates, and
  `none` (difference) what reaches none of them. A query or logic act that follows a logic act
  constrains the flow coming out of it, which is downstream of the select's cardinality term: it
  filters the agent already chosen rather than changing what was chosen from. This is the guide's
  "selection boundary" (**R18**).
- **A plain act with several incoming edges fires once per arriving item**, so an act reached by
  two branches can fire twice for the same agent; joining them through `any` makes it fire once.
- **Evaluates are pure.** They compute a value from their inputs and change nothing. Only commands
  change state: set, move, leave, die, connect, disconnect, replace, create, cause.
- **Flows are acyclic.** Iteration comes from selections being sets and from rules applying to every
  agent. Recursion is possible only through cause.
- **Order is not part of a flow's meaning**, but state changes make it observable: two sets on
  separate branches, or two agents of the same rule, can see each other's changes. The interpreter
  needs a defined, deterministic order for branches, rules and agents (**R14**).
- **Initialize and created agents.** The guide says initialize acts don't run for agents created
  during the run (the sentence is cut off in the source) (**R15**).

## Review items

**R1. ID scope.** MetaABM says IDs are unique across the model, but act IDs repeat from agent to
agent (`rootActGroup` in every agent, `bugRule` in an agent and in its style). _Proposed:_ IDs are
unique among siblings. Acts are referred to within their agent; attributes and agents by
`agent.attribute` paths.

**R2. Names.** _Decided:_ drop the ecore prefixes; context → scape, projection → space (as the guide
anticipated: "in future releases, we will probably refer to Contexts as 'Scapes'"). Other names
follow the ecore without its prefix.

**R3. Arrays.** All 22 attribute arrays in the examples are the grid's automatic "Dimensions"
array, which repeats `width` and `height`. _Proposed:_ keep arrays as a type, but have the
translation drop the generated Dimensions array.

**R4. Parameter ranges.** Context attributes are the parameters, and MetaABM has no min or max for
them. Studio uses ranges for sliders. _Proposed:_ add optional `min` and `max` to attributes, as the
only addition to the structure.

**R5. Act groups.** `AGroup` is a full act with `members`, but in every example it only serves as
the root container. _Proposed:_ flatten to an `acts` record, and keep group as an act type only if
you meant it to be used for nested grouping.

**R6. Border rules.** Four example grids use `STRICT`, which the guide calls obsolete. Its
"APeriodic" isn't in the enum. _Proposed:_ `periodic` and `sticky` (= aperiodic); the translation
maps `STRICT` to `sticky`. Was there a real difference between strict and sticky?

**R7. Unused metaclasses.** Geography, value layers, shaped and loaded agents, and build geography
are not used by any example. _Proposed:_ keep them in the format so the translation is complete,
and have the checker say "not supported yet".

**R8. Styles as acts.** A style is a rule whose evaluates run `colorRed` → `shapeOval` →
`graphicFill`: drawing commands executed in order, which is imperative, unlike the rest of the act
model. _Proposed:_ keep it exactly as is so the translation is direct. The interpreter runs the
chain against a drawing context.

**R9. Code generation features.** `SImplementation`, implemented libraries and `AMethod.generate`
only make sense for Java code generation. _Proposed:_ drop the first two. The translation reports
a non-default implementation mode.

**R10. System dynamics.** SIR uses a separate metamodel (`sd.ecore`: stocks, flows, auxiliary
variables) hooked in through `IAgentChild`. _Proposed:_ keep the extension point, and treat the SD
metamodel as a second, later port. Until then SIR stays as code.

**R11. Functions with several outputs.** `FGenericFunction` can have several outputs, but
`AInput.value` refers to the whole evaluate act, so it isn't clear how an input picks one output.
I haven't found an example that uses a second output yet. Do you remember how this was meant to
work?

**R12. Function semantics.** The meaning of each function is defined only by the generator
templates, and those differ between Ascape, Escape and Repast. _Proposed:_ treat the Escape
templates and runtime as authoritative, since Escape was AMP's own runtime, and write each
function's meaning into the core library's description as it is ported.

**R13. Selecting one versus all.** Settled by the generators: cardinality is a query term (`all`,
`nearest`, `minimize`, `maximize`, else one at random), which is what replaced `for`. The format
drops `for`, and the translation drops it with a warning if it disagrees with the query terms.
(The first draft of this item, which said a select could return only one agent, was wrong.)

**R14. Execution order.** MetaABM leaves rule order undefined. Metascape's run-time settings
(Ascape's execution order, random execution, rule order, all editable while running) have no place
in the metamodel. _Proposed:_ add Ascape's execution settings to the context as optional fields,
defaulting to what the Escape target did.

**R15. Initialize for created agents.** The guide says initialize acts don't run for agents created
during the run, but the sentence is cut off. Confirm, or say what was intended.

**R16. Watch and derive.** A watch fires inside the set that triggers it, so a chain of watches is
recursive and can loop (the guide warns about it). A derive is computed lazily. _Proposed:_ watches
run immediately and in order, with a depth limit that stops the run with a clear message; derives
are cached until one of their inputs changes.

**R17. Diffusion.** `ADiffuse` names the attribute and rates but not the neighbourhood or the
update scheme. _Proposed:_ take both from the Escape implementation (both phases computed from the
start-of-period values, over the grid's neighbourhood).

**R18. Logic and boundaries.** In dataflow terms (see above), the boundary is just where a flow
passes the select's cardinality term: constraints before it shape the set that is chosen from, and
constraints after it filter what was chosen. _Proposed:_ implement exactly that, with the checker
pointing out a query placed after a logic act on a selection that picks one agent, since that is
the case the guide warns about.

**R19. Die and leave.** Both carry a `destination` that the guide calls irrelevant. _Proposed:_
make it optional, and have the translation drop it.

**R20. Deprecated builder types.** `networkType` and `spaceType` are deprecated, and `networkType`
silently defaults to Barabasi in every file. _Proposed:_ leave both out of the format. Networks are
built with connect acts, as the guide says.

**R21. Methods.** `AMethod` holds Java. StupidModel5's `ConsumeFood` takes `min(food, maximum
consumption)` from the cell and adds it to the bug's size, which acts can express. _Proposed:_ keep
method in the format with a `language` field, and have the interpreter refuse Java. The imported
StupidModel5 then gets that one method replaced by equivalent acts, recorded as a deviation from
the original.

**R22. Multi-values.** Settled by the generator (`Java.xpt`, `MultiBlock`): a multi-value is the
first input of a distribution function (`uniformAdditiveDistribution`, `crossDistribution` and so
on) and lists the state attributes that the distribution's parameters vary by. Cross distributions
take one parameter per combination of options; additive ones take a base value plus an increment
per option. An empty list means the parameters don't vary. The format keeps multi-value as it is.

**R23. Which copy is the original.** Several examples exist once per target (`examples.ascape`,
`examples.escape`, `examples.repast`), and the copies differ: StupidModel1 by a few lines,
Epidemic by about 250. _Decided:_ the Escape copies are the source of truth.

**R24. Charts and stopping.** MetaABM has neither. Statistics come from `gatherData`; charts and
parameter sets were separate AMP files (`.apar`, AData). The current format has `charts` and a
`stop` action. _Proposed:_ move charts, and stop conditions if any model needs one, into a separate
view and experiment document beside the model, and keep the model as pure MetaABM.

**R25. Licence and provenance.** The earlier note said the format was designed fresh so that it
carried nothing over from the ecore. Taking the ecore's structure directly reverses that. Both are
EPL, so this is a provenance note, not a licensing problem. _Proposed:_ the spec sources say they
are derived from the MetaABM metamodel (Eclipse AMP, EPL).

## Work, in order

1. Settle the review items.
2. **Format:** types and Zod schemas for structure, functions and acts; the checker (references,
   types of inputs against function prototypes, acyclic flows, boundaries).
3. **Core library:** `core_library.metaabm` translated to data, with TypeScript implementations of
   every function the examples use.
4. **Interpreter:** acts compiled once into closures over the engine, following the semantics above.
5. **Translation:** `.metaabm` → format, with diagnostics for anything dropped or not supported. Its
   tests are the AMF test models (`tests/*/TestBasics.metaabm`, `TestSpatial`, `TestMovement`).
6. **Examples:** import the Escape AMP examples as generated data, kept with their `.metaabm`
   originals. Delete the code ports in `packages/models/src/amp`, rewrite the five hand-written spec
   examples in the new format, and point Studio at the result.

The Brookings and Ascape ports are unaffected: their originals are Java, not MetaABM.
