# The model format, taken from the MetaABM metamodel

Status: 2026-11-16. Work items 2 and 3 (the format, its checker, and the core library as data)
are implemented in `packages/spec/src/metamodel`, exported as `@metascape/spec/metamodel`. The
function implementations, the interpreter and the translation are not.

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
| `SAttributeArray` (`size`)                                     | —                                                                                                      | No array type (**R3**).                                                                                                                                                                       |
| `SState`, `SStateValue`, `defaultOption`                       | state attribute with `options` (each labelled and described) and `defaultOption`                       |                                                                                                                                                                                               |
| Context attributes                                             | the model's parameters                                                                                 | In MetaABM a context's attributes are its parameters. The current format's separate `parameters` block goes. Its `min`/`max` (used by Studio's sliders) have no MetaABM counterpart (**R4**). |
| `SAgent` (`attributes`, `rootActivity`, `styles`, `children`)  | agent: `attributes`, `acts` (a group), `styles`, `extensions`                                          | (**R5**)                                                                                                                                                                                      |
| `SContext` (`agents`, `projections`, `valueLayers`, `library`) | context: everything an agent has, plus `agents` (which may include contexts), `projections`, `library` | The root of a model is a context, as in Ascape where the model is the root scape. Nesting fixes the "agents that own their own scapes" gap (EpidemicRegional).                                |
| `SProjection`                                                  | projection, with `attributes`                                                                          | Projections have attributes, which hold their sizes (`width`, `height`).                                                                                                                      |
| `SNDimensional` (`dimensionality`, `borderRule`)               | `dimensions` (ordered size attributes), `borderRule`                                                   | Dimensionality is the number of size attributes (**R3**).                                                                                                                                     |
| `SBorderRule`                                                  | `periodic`, `sticky`                                                                                   | Strict and bouncy are Repast-only and dropped (**R6**).                                                                                                                                       |
| `SContinuousSpace`                                             | continuous space                                                                                       |                                                                                                                                                                                               |
| `SGrid` (`multiOccupant`, `neighborhood`)                      | grid                                                                                                   | `neighborhood`: `euclidean`, `moore`, `vonNeumann`. Euclidean is new compared with the current format.                                                                                        |
| `SNetwork` (`directed`)                                        | network                                                                                                |                                                                                                                                                                                               |
| `SGeography`                                                   | geography                                                                                              | Not used by any example. Kept in the format; the interpreter rejects it for now (**R7**).                                                                                                     |
| `SValueLayer`                                                  | —                                                                                                      | Only a name, unused (**R7**).                                                                                                                                                                 |
| `SStyle`, `SStyle2D`, `SStyleShape` (`shape`), `SStyle3D`      | style, with its own acts                                                                               | The acts declare how an agent looks (**R8**).                                                                                                                                                 |
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
| `AAct` (`targets`, `selected`, `group`)                                          | act: `targets`, `selected`                              | `group` is the containing group.                                                                                                  |
| `AGroup` (`members`)                                                             | group                                                   | The container of an agent's acts; groups can nest (**R5**).                                                                       |
| `ASelect` (`agent`, `space`, `for`)                                              | select                                                  | `for` (`ONE`/`ALL`) is obsolete: cardinality is set by query terms instead (**R13**).                                             |
| `ARule`                                                                          | rule                                                    | Once per agent per period. The guide calls the order of rules "technically undefined" (**R14**).                                  |
| `ASchedule` (`start`, `interval`, `priority`, `pick`)                            | schedule                                                | Not used in the examples; `pick` is marked as likely to be replaced.                                                              |
| `ABuild`                                                                         | build                                                   | Once per context, before any initialize.                                                                                          |
| `AInitialize`                                                                    | initialize                                              | Once per agent at the start (**R15**).                                                                                            |
| `AWatch` (`attribute`)                                                           | watch                                                   | Fires whenever the attribute is set, even to the value it already has. 6 uses, in the Epidemic family (**R16**).                  |
| `ADerive` (`attribute`)                                                          | derive                                                  | Computes a derived attribute; its value is the last evaluate on the path. 4 uses (**R16**).                                       |
| `ADiffuse` (`diffused`, `diffusionRate`, `evaporationRate`)                      | diffuse                                                 | Neighbourhood and update scheme come from the space (**R17**).                                                                    |
| `APerform`                                                                       | perform                                                 | Runs only when a cause names it.                                                                                                  |
| `ACause` (`result`)                                                              | cause                                                   | Runs a root act on the current selection. Recursion is allowed. 1 use.                                                            |
| `AQuery`                                                                         | query: `function`, `inputs`                             | A sink and a control.                                                                                                             |
| `AAll`, `AAny`, `ANone`                                                          | all, any, none                                          | Intersection, union and difference (**R18**).                                                                                     |
| `AEvaluate`                                                                      | evaluate: `function`, `inputs`                          | A sink whose value flows to its targets.                                                                                          |
| `ASet` (`attribute`, `parameter`)                                                | set                                                     | `parameter` is a value: an attribute, a literal, or an evaluate.                                                                  |
| `AMove`, `ALeave`, `ADie` (`destination`)                                        | move, leave, die                                        | Only move has a `destination` (**R19**).                                                                                          |
| `AConnect` (`within`, `directed`), `ADisconnect`, `AReplace`                     | connect, disconnect, replace                            | `replace` covers "clear all links of an agent, then connect".                                                                     |
| `ACreateAgents` (`agentCount`)                                                   | create                                                  | A kind of select, so later acts can work on the new agents.                                                                       |
| `ACreateShapedAgents`, `ALoadAgents`, `ALoadShapedAgents` (`shape`, `sourceURL`) | kept in the format, rejected by the interpreter for now | Not used by the examples (**R7**).                                                                                                |
| `ABuildGrid` (`agents`, `fillAgent`, `projection`)                               | build grid                                              |                                                                                                                                   |
| `ABuildSpace` (`spaceType`)                                                      | build space                                             | `spaceType` is deprecated (**R20**).                                                                                              |
| `ABuildNetwork` (`networkType`)                                                  | build network                                           | `networkType` is deprecated, and never set in the examples: every file takes the default, `Barabasi`, without using it (**R20**). |
| `ABuildGeography`                                                                | build geography                                         | Unused (**R7**).                                                                                                                  |
| `AMethod` (`body`, `generate`)                                                   | method                                                  | Body in the model's implementation language, TypeScript (**R21**).                                                                |
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
  needs a defined, deterministic order for branches, rules and agents. Rules and agents follow the
  generators (**R14**); branches follow the order of the acts in the file.
- **Initialize runs only at the start**, over the agents present then; agents created during
  the run don't get it (**R15**).

## Review items

**R1. ID scope.** _Decided:_ IDs are unique among siblings. MetaABM says IDs are unique across
the model, but act IDs repeat from agent to agent (`rootActGroup` in every agent, `bugRule` in an
agent and in its style). Acts are referred to within their agent; attributes and agents by
`agent.attribute` paths.

**R2. Names.** _Decided:_ drop the ecore prefixes; context → scape, projection → space (as the guide
anticipated: "in future releases, we will probably refer to Contexts as 'Scapes'"). Other names
follow the ecore without its prefix.

**R3. Arrays.** _Decided:_ no array type. The only case for arrays is a fixed-size vector on an
agent, and the guide itself says that usually means a new agent is wanted. Nothing in the examples
uses one except the grid's automatic "Dimensions" array, and the array functions (`item`, `length`,
`randomMember`, `randomWeighted`) go with it. A space's dimensions are an explicit part of its
definition: an ordered list of size attributes (`width`, `height`), which are ordinary attributes, so
they can be set like any parameter. Dimensionality is the length of that list.

**R4. Parameter ranges.** _Decided:_ optional `min` and `max` on attributes, the only addition
to the structure.

**R5. Act groups.** _Decided:_ keep `AGroup` as it is: the container of an agent's acts, and
itself an act, so groups can nest. Flattening it bought nothing but shorter files. The intent may
have been composability (a group of behaviour reused elsewhere); neither the guide nor the
generators define that, so it is left for later and the structure keeps the door open.

**R6. Border rules.** _Decided:_ strict and bouncy are Repast distinctions and are dropped. A
border rule is `periodic` or `sticky`; the translation maps `STRICT` and `BOUNCY` to `sticky` with a
note.

**R7. Unused metaclasses.** _Decided:_ geography, value layers, shaped and loaded agents, and
build geography stay in the format so the translation is complete; the checker says "not supported
yet".

**R8. Styles.** _Decided:_ a style's acts declare how an agent looks (filled, red, oval); they
say nothing about when anything happens. The interpreter gathers the colour, shape, fill and outline
the flow reaches and draws the agent with them. The first draft called this imperative, which was
wrong.

**R9. Code generation features.** _Decided:_ `SImplementation`, `SImplementationMode`,
implemented libraries and `AMethod.generate` are dropped. Raw code stays possible through method
acts (R21).

**R10. System dynamics.** _Decided:_ keep the extension point; port the SD metamodel
(`sd.ecore`) as a later piece of work. Until then SIR stays as code. Listed in `docs/roadmap.md` so
it isn't lost.

**R11. Functions with several outputs.** Settled by the generators: a function's result type is
taken from its output prototypes (`types.ext`, `resultType`), and only one function in the core
library, `boundary2D` (X and Y), declares more than one output. No example uses it. _Proposed:_ a
function has one result; `boundary2D` is left out until something needs it.

**R12. Function semantics.** _Decided:_ the meaning of each function follows the Escape
generator (which uses the Ascape generator's selection code), and is written into the core library
as each function is ported. Every ambiguity found along the way is listed under
[Ambiguities](#ambiguities) rather than resolved silently.

**R13. Selecting one versus all.** Settled by the generators: cardinality is a query term (`all`,
`nearest`, `minimize`, `maximize`, else one at random), which is what replaced `for`. The format
drops `for`, and the translation drops it with a warning if it disagrees with the query terms.
(The first draft of this item, which said a select could return only one agent, was wrong.)

**R14. Execution order.** Settled by the generators: every scape, including grids, gets
`setExecutionOrder(Scape.RULE_ORDER)`, rules are added in the order the acts appear, and agents are
visited in Ascape's default random order. _Proposed:_ those are the defaults, held as optional
execution settings on each scape (Ascape's execution order, random execution and rule order), so
Metascape's run-time editing of them keeps working.

**R15. Initialize for created agents.** Settled by the generators: initialize acts become Ascape
initial rules (`addInitialRule`), which run once over the agents present when the scape starts.
Agents created during the run don't get them, as the guide says.

**R16. Watch and derive.** _Decided:_ a watch keeps MetaABM's behaviour, firing whenever its
attribute is set. One global limit on how deep watches and causes may trigger each other stops a
runaway chain with a clear message. A derive is computed on read: it recomputes only when a value
upstream of it has changed since the last read, and otherwise returns the value it has.

**R17. Diffusion.** _Decided:_ diffusion takes both its neighbourhood and its update scheme
from the space. That is the point of the design, and the generator does exactly this: each cell
averages over its own `findNeighbors()` (the grid's neighbourhood and border rule) in an Ascape
`ExecuteThenUpdate` rule. `ADiffuse` carries only the attribute and the two rates. The first draft
proposed specifying these on the act, which was wrong.

**R18. Logic and boundaries.** _Decided:_ as described under the execution semantics. The
boundary is where a flow passes the select's cardinality term: constraints before it shape the set
chosen from; constraints after it filter what was chosen. The checker points out a query after a
logic act on a selection that picks one agent, the case the guide warns about.

**R19. Die and leave.** _Decided:_ only move has a `destination`. In the ecore every transform
requires one, but for die and leave it means nothing (the agent dies, or leaves the space its own
selection is in), and in every example the editor filled it with the act's own selection
(`dieAtAge` → `dieAtAge`). The translation drops it, with a warning if it ever differs.

**R20. Deprecated builder types.** _Decided:_ `networkType` and `spaceType` are left out.
Networks are built with connect acts.

**R21. Methods.** _Decided:_ a model states its implementation language once, at the root;
the only option for now is TypeScript, and method bodies are TypeScript. StupidModel5's
`ConsumeFood` is Java, so the translation flags it, and it is ported by hand to TypeScript as a
recorded deviation. Still to design: what a method body can see (the acting agent and its
attributes, the scape, the model's random stream) and how it is sandboxed.

**R22. Multi-values.** Settled by the generator (`Java.xpt`, `MultiBlock`): a multi-value is the
first input of a distribution function (`uniformAdditiveDistribution`, `crossDistribution` and so
on) and lists the state attributes that the distribution's parameters vary by. Cross distributions
take one parameter per combination of options; additive ones take a base value plus an increment
per option. An empty list means the parameters don't vary. The format keeps multi-value as it is.

**R23. Which copy is the original.** Several examples exist once per target (`examples.ascape`,
`examples.escape`, `examples.repast`), and the copies differ: StupidModel1 by a few lines,
Epidemic by about 250. _Decided:_ the Escape copies are the source of truth.

**R24. Charts, parameters and stopping.** _Decided:_ two separate, typed, declarative models
beside the core model.

- **Curation:** what to look at (views, charts, the most interesting measures). The current
  format's `charts` move here.
- **Run specs:** how a model is run, ported from AMP's own run metamodels. APar
  (`amf.parameters/APar.xtext`) set attribute values for a run, swept them (`attr [start, end,
increment]`), linked sweeps together, and incorporated other run files. ATest (`amf.testing`)
  stated constraints on results: a measure of an agent's attribute within a minimum and maximum.
  The stop period is part of a run spec: in AMP it was Ascape's `Runner.stopPeriod`, set from an
  `.apar` file (`"Stop Period"=100`).

Stopping on a condition (rather than at a period) has no counterpart in AMP. Where it belongs, in
a run spec or in the model, is still open.

**R25. Licence and provenance.** _Decided:_ the format credits its origin plainly, in the
spec package's README and source headers, and in `NOTICE`. The metamodel began as "score", a
component of Repast Simphony contributed under the EPL by Argonne National Laboratory; it was
developed by Metascape from 2007 as MetaABM, and contributed to Eclipse as part of the Agent
Modeling Platform (AMP) in 2009. The name MetaABM is still not used for the format itself.

## Ambiguities

Places where the guide, the generators and the examples leave the meaning unclear, collected as
the work finds them. Each one is resolved by a decision recorded here, not by the implementation.

Structure and references:

- **ID scope.** R1 says IDs are unique among siblings. Two references need more: act IDs are
  unique within an agent or style across all its nested groups, because acts refer to each other
  by bare ID; and agent, scape and space IDs are unique across the model, because an attribute
  reference (`owner.attribute`) starts with one. That second rule is MetaABM's own (model-wide
  IDs). A style's acts are a namespace of their own, apart from its agent's (`bugRule` is in both
  in StupidModel 1).
- **The root group.** Kept as an object, `acts: { id, label, members }`, since its ID and label
  vary in the examples (`rootActGroup`, `actions`, `executeBuy`, `definition`). Groups are not
  flow nodes: a group in `targets` is an error.
- **Root acts carry no `agent` and no `selected`.** In every example a root's agent is the agent
  that owns it (for a style, the styled agent), and its selection is itself. The translation
  drops both, with a warning if one ever differs.
- **Disconnect has no destination.** The generators ignore it (`clearNeighbors(mover)` in
  `inferascape.ext`, which Escape uses), and the two examples disagree on what it holds. Same
  treatment as die and leave (R19). Connect and replace keep theirs.
- **Cause.** `result` names a root act of the same agent, as acts do. The one example (Markets)
  causes the firm's own initialize.
- **Core library constants.** `core_library.metaabm` also defines the attributes `true`,
  `false`, `zero` and `unit`, which the examples use 92 times as values. The translation writes
  them as literals (`true`, `false`, `0`, `1`). `path` and `self` are unused and dropped.
- **Literals** are `{ literal, type? }`. The generators type a literal from its text (`1.0` is
  real, `1` integer); JSON numbers lose that, so the translation writes `type: 'real'` for a
  literal with a decimal point (`1.0` and `10.0` occur in the examples).
- **Grid neighbourhood** is required. In XMI an omitted `neighborhood` means the ecore default,
  Euclidean (three Escape grids omit it), so the translation must write `euclidean` then.
- **Left out of the structure:** a style's attributes (`SStyle` is attributed in the ecore; no
  example uses it) and `SContext.library` (user libraries, R9). `ABuildProjection.attributes` is
  kept as a list of attribute references, though nothing sets it and its meaning is unknown.
- **Typed IDs** are type aliases (`ActId`, `AgentId`, `AttributeRef` and so on), not branded
  types, so a model written in TypeScript stays a plain object literal. The checker resolves them.
- **Execution settings** (R14's proposal) are not in the format yet.

Core library:

- `not` takes a boolean. Its prototype has no type in `core_library.metaabm`, which makes it the
  ecore default, integer.
- `randomState` yields an option of its input state. The library declares an integer output; the
  format gives it a generic one, whose type then follows the input.
- `pow` is in the library twice (the operator `^` and Java's `Math.pow`). The math one is left
  out; the translation maps it onto the operator. Neither is used by the examples.
- `withinBoundaries` is left out with the array functions (R3): its only input is an array of four
  bounds.
- `original`'s one input has no ID; it is called `value`.
- Prototype types `UNDEFINED` and `NUMERIC` are `generic` and `numeric` (the generators'
  `typeLongName` calls the first "Generic"). `FMultiArgumentPrototype` is a prototype with
  `multiple: true`, which takes one multi-value input.
- Plural labels are not carried over (they are editor defaults such as "Core Functionss").
  Descriptions are kept as written, except that `timeNow`'s "current simulation period" is "current
  period".

Checking:

- **Types of values**, following `types.ext`: a logical function gives a boolean; a function
  with a concrete output type gives that; otherwise the inputs decide (symbol if any is a
  symbol, boolean if all are, real if any is real, integer if all are, else numeric). Values of
  one state keep that state. A function with no output (colours, shapes, `graphicFill`) has no
  value, so it cannot be an input. An integer fits where a real is expected (Java widening); a
  `numeric` result fits an integer, since it cannot be told apart. A state's options fit only
  generic inputs.
- **Upstream.** An act's selection, a move's or connect's destination, an input's `selected`
  and an evaluate used as a value must be upstream of the act, since they are bound only on
  the flows that pass through them. All twelve Escape examples satisfy this.
- **Selections.** Spatial query terms are the functions in the library's `spatial`
  sub-library (`isSpatialControl` in `infer.ext`). They cannot be evaluates, and all but `all`,
  `minimize` and `maximize` need their selection to name a space. A selection picks by at most
  one of `nearest`, `minimize` and `maximize`; `all` combines with any of them. Logic acts take
  only queries and logic acts as sources, which may belong to different selections (the
  Demographic Prisoner's Dilemma combines queries of two). The R18 warning applies to a query
  whose source is a logic act, on a selection without an `all` term.
- **Severity.** Things not supported yet (geography, value layers, shaped and loaded agents,
  building geographies, shape styles, extensions) are warnings: the model is valid, and the
  interpreter will reject it.

## Work, in order

1. Settle the review items. Still open: R21's method API, and where condition-based stopping
   belongs (R24).
2. **Format:** types and Zod schemas for structure, functions and acts; the checker (references,
   types of inputs against function prototypes, acyclic flows, boundaries). _Done._
3. **Core library:** `core_library.metaabm` translated to data (_done_), with TypeScript
   implementations of every function the examples use (with the interpreter).
4. **Interpreter:** acts compiled once into closures over the engine, following the semantics above.
5. **Translation:** `.metaabm` → format, with diagnostics for anything dropped or not supported. Its
   tests are the AMF test models (`tests/*/TestBasics.metaabm`, `TestSpatial`, `TestMovement`).
6. **Examples:** import the Escape AMP examples as generated data, kept with their `.metaabm`
   originals. Delete the code ports in `packages/models/src/amp`, rewrite the five hand-written spec
   examples in the new format, and point Studio at the result.

7. **Run specs and curation** (R24), after the examples run: port APar and ATest, and move charts
   into the curation model.

The Brookings and Ascape ports are unaffected: their originals are Java, not MetaABM.
