# The model format, taken from the MetaABM metamodel

Status: 2026-11-17. Work items 2 to 4 (the format, its checker, the core library with its
function implementations, and the interpreter) are implemented in `packages/spec/src/metamodel`,
and are `@metascape/spec` (`compileModel`); the earlier format is gone. Work item 5, the translation from
`.metaabm` files, is implemented in `packages/spec/src/metaabm` (`@metascape/spec/metaabm`), with
the twelve Escape examples and their translations in `packages/spec/examples`. All twelve run in
the interpreter, and they are the AMP models of the catalogue (`packages/models/src/amp`) in
place of the code ports; StupidModel5's Java method is ported by hand beside it (R21). Of the
earlier format's five examples, Life, Schelling and Foragers are rewritten in the format; the
small-world Epidemic and Pursuit are left out, since they need what the format does not have
(see [Ambiguities](#ambiguities)).

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

This replaces the earlier format; it does not extend it. The earlier format was a nested,
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
- **Cross-references are paths of IDs**, following the nesting, resolved and checked by the
  checker. In XMI they are paths too (`//@agents[ID='bug']/@rootActivity/@members[ID='bugRule']`).
  In the new format, agents, spaces and attributes are referred to by their path from the root
  scape (`bug`, `region.farmer`, `bug.energy`, or `bugCount` for an attribute of the root scape),
  and acts by their path within their agent's acts (`bugRule`, `moves.step`) (**R1**).
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
| `SAttribute`                                                   | attribute: `type`, `default`, `gatherData`, `units`, `immutable`, `derived`                            | `defaultValue` is a string in the ecore; the format stores a typed literal. The earlier format's `initial` expression goes, since initial values are set by Initialize acts.                  |
| `SAttributeType`                                               | `boolean`, `integer`, `real`, `symbol`                                                                 | `UNDEFINED` and `NUMERIC` are only for function prototypes (polymorphic arguments); models may not use them. `symbol` is new compared with the earlier format (8 uses in the examples).       |
| `SAttributeArray` (`size`)                                     | —                                                                                                      | No array type (**R3**).                                                                                                                                                                       |
| `SState`, `SStateValue`, `defaultOption`                       | state attribute with `options` (each labelled and described) and `defaultOption`                       |                                                                                                                                                                                               |
| Context attributes                                             | the model's parameters                                                                                 | In MetaABM a context's attributes are its parameters. The earlier format's separate `parameters` block goes. Its `min`/`max` (used by Studio's sliders) have no MetaABM counterpart (**R4**). |
| `SAgent` (`attributes`, `rootActivity`, `styles`, `children`)  | agent: `attributes`, `acts` (a group), `styles`, `extensions`                                          | (**R5**)                                                                                                                                                                                      |
| `SContext` (`agents`, `projections`, `valueLayers`, `library`) | context: everything an agent has, plus `agents` (which may include contexts), `projections`, `library` | The root of a model is a context, as in Ascape where the model is the root scape. Nesting fixes the "agents that own their own scapes" gap (EpidemicRegional).                                |
| `SProjection`                                                  | projection, with `attributes`                                                                          | Projections have attributes, which hold their sizes (`width`, `height`).                                                                                                                      |
| `SNDimensional` (`dimensionality`, `borderRule`)               | `dimensions` (ordered size attributes), `borderRule`                                                   | Dimensionality is the number of size attributes (**R3**).                                                                                                                                     |
| `SBorderRule`                                                  | `periodic`, `sticky`                                                                                   | Strict and bouncy are Repast-only and dropped (**R6**).                                                                                                                                       |
| `SContinuousSpace`                                             | continuous space                                                                                       |                                                                                                                                                                                               |
| `SGrid` (`multiOccupant`, `neighborhood`)                      | grid                                                                                                   | `neighborhood`: `euclidean`, `moore`, `vonNeumann`. Euclidean is new compared with the earlier format.                                                                                        |
| `SNetwork` (`directed`)                                        | network                                                                                                |                                                                                                                                                                                               |
| `SGeography`                                                   | geography                                                                                              | Not used by any example. Kept in the format; the interpreter rejects it for now (**R7**).                                                                                                     |
| `SValueLayer`                                                  | —                                                                                                      | Only a name, unused (**R7**).                                                                                                                                                                 |
| `SStyle`, `SStyle2D`, `SStyleShape` (`shape`), `SStyle3D`      | style, with its own acts                                                                               | The acts declare how an agent looks (**R8**).                                                                                                                                                 |
| `SImplemented`, `SImplementation`, `SImplementationMode`       | —                                                                                                      | Java package, class and paths for code generation. Dropped (**R9**).                                                                                                                          |
| `IModelExtension`, `IAgentChild`, `IAttributeChild`            | `extensions`                                                                                           | Extension points. The only user is the system dynamics extension (`sd.ecore`), in the SIR example (**R10**).                                                                                  |

Membership in projections comes from the builder acts, not from the agent. `ABuildGrid.agents`
lists the agents that may occupy a grid and `fillAgent` its cells; `ABuildNetwork.agents` and
`ABuildSpace.agents` work the same way. So an agent can be in a grid and a network at once, which
fixes that gap. The earlier format's `agent.space` and `as: cell | occupant` go.

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
agent and in its style). References are paths that follow the nesting, so uniqueness among
siblings is all they need: acts by their path within their agent or style, agents, spaces and
attributes by their path from the root scape.

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
visited in Ascape's default random order. _Proposed, and implemented:_ those are the defaults,
held as optional `execution` settings on each agent and scape (`order: 'rule' | 'agent'`,
`randomOrder`, and `rules`, the rule acts in the order they run). They become the settings of the
engine scape the agents are in, so Metascape's run-time editing of them keeps working. The
checker makes sure `rules` names the agent's own rule, schedule or diffuse acts, each once.

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
recorded deviation.

_Proposed (implemented in `method.ts`):_ a body is the statements of a function of three
arguments, written in TypeScript without type annotations, so that it runs without a compiler:

- `agent`: the agent bound by the method's `selected` (default: the agent whose flow it is), as
  `get(attribute)`, `set(attribute, value)`, `id`, and `cell`, the grid cell it stands on, seen
  the same way. Attributes are named by ID. `set` runs the attribute's watches, as a set act does.
- `scape`: the scape the agent is in (the root scape's own for the root), with the same `get` and
  `set` for its attributes (the model's parameters), and `period`.
- `random`: the model's seeded stream, as the acting agent draws from it: `unit()`, `int(min, max)`
  (both inclusive), `chance(p)` and `pick(items)`.

`this` is undefined and a return value is ignored. The body is compiled once, when the model is,
so a body that does not compile is reported then. `Math` is there without `Math.random`, and
`Date`, `globalThis`, `window`, `document`, `fetch`, `XMLHttpRequest`, `setTimeout`,
`setInterval`, `crypto` and `performance` are hidden, so that a run stays determined by its seed.
That keeps honest code honest; it is not a security boundary, which would be needed if models
came from people the user does not trust (left open). StupidModel5's `ConsumeFood`, ported by
hand, reads:

```ts
const habitat = agent.cell;
const availability = habitat.get('foodAvailability');
const consumption = Math.min(availability, agent.get('maxConsumption'));
agent.set('size', agent.get('size') + consumption);
habitat.set('foodAvailability', availability - consumption);
```

Left open: whether a body should see agents bound by other selections of its flow; for now a
method that needs another agent reaches it only through its cell.

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
a run spec or in the model, is still open. The earlier format's examples stopped on conditions
(Schelling once everyone is happy, Foragers once none is left); their rewrites run on until this
is settled.

**R25. Licence and provenance.** _Decided:_ the format credits its origin plainly, in the
spec package's README and source headers, and in `NOTICE`. The metamodel began as "score", a
component of Repast Simphony contributed under the EPL by Argonne National Laboratory; it was
developed by Metascape from 2007 as MetaABM, and contributed to Eclipse as part of the Agent
Modeling Platform (AMP) in 2009. The name MetaABM is still not used for the format itself.

## Ambiguities

Places where the guide, the generators and the examples leave the meaning unclear, collected as
the work finds them. Each one is resolved by a decision recorded here, not by the implementation.

Structure and references:

- **References are paths** (owner's decision). The last ID of an attribute reference is the
  attribute; what comes before it is the path of its owner (agent, scape or space) from the root
  scape, empty for the root scape itself (`bugCount`, `bug.energy`, `grid2D.width`,
  `region.farmer.wealth`). An option is its attribute's reference, then its ID. Acts are referred
  to by their path within their agent or style (`moves.step` for an act in a group), so a style's
  acts resolve within the style. IDs are unique among siblings only (R1), and the siblings of an
  element are all its children, across its records (an attribute and an agent of one scape may
  not share an ID). The root scape cannot be named by a reference to an agent; no example does.
- **The root group** (owner's decision). An agent's or style's `acts` holds the members of its
  root group directly. Nothing refers to the group, so its ID and labels are dropped; the
  translation notes a label other than the editor's "Root Act Group" (`Actions`, `Execute Buy`,
  `Definition` in the examples). Groups are not flow nodes: a group in `targets` is an error.
- **Root acts carry no `agent` and no `selected`.** In every example a root's agent is the agent
  that owns it (for a style, the styled agent), and its selection is itself. The translation
  drops both, with a warning if one ever differs.
- **Disconnect has no destination.** The generators ignore it (`clearNeighbors(mover)` in
  `inferascape.ext`, which Escape uses), and the two examples disagree on what it holds. Same
  treatment as die and leave (R19). Connect and replace keep theirs.
- **Cause.** `result` names a root act of the same agent, as acts do. The one example (Markets)
  causes the firm's own initialize.
- **Core library constants** (owner's decision). `core_library.metaabm` also defines the
  attributes `true`, `false`, `zero` and `unit`, which the AMP examples use as values. They are
  constants of the core library, referred to as `{ constant: 'unit' }`. `zero` and `unit` are
  numeric, so they take the type of where they are used: `unit` is 1 in a grid and 1.0 in a
  continuous space. `path` and `self` are unused and left out.
- **Literals** are `{ literal, type? }`. The generators type a literal from its text (`1.0` is
  real, `1` integer); JSON numbers lose that, so the translation writes `type: 'real'` for a
  literal with a decimal point (`1.0` and `10.0` occur in the examples).
- **Grid neighbourhood** is required. In XMI an omitted `neighborhood` means the ecore default,
  Euclidean, since EMF does not write default values (three Escape grids omit it), so the
  translation writes `euclidean` then.
- **Left out of the structure:** a style's attributes (`SStyle` is attributed in the ecore; no
  example uses it) and `SContext.library` (user libraries, R9). `ABuildProjection.attributes` is
  kept as a list of attribute references, though nothing sets it and its meaning is unknown.
- **Typed references** are type aliases (`ActRef`, `AgentRef`, `AttributeRef` and so on), not branded
  types, so a model written in TypeScript stays a plain object literal. The checker resolves them.
- **Execution settings** (R14) are an optional `execution` on agents and scapes: an addition
  to MetaABM, which had none.

Translation (`packages/spec/src/metaabm`). Each translated element that loses something, or
gets something written out that the XMI left out, has a diagnostic with its XMI path: a `note`
where this document decides it, a `warning` where it is worth a look, an `error` where the
element could not be translated. The kinds are `dropped`, `defaulted`, `moved`, `unsupported` and
`invalid`.

- **Attributes with no `sType`.** The ecore default is `INTEGER`, and the Escape examples agree:
  the generated Java has `int individualCount` for an attribute with no `sType`. The older AMF
  test models were saved when the default was `BOOLEAN` (their generated Java has `boolean
boolean1` for an attribute with no `sType`). The translation takes `integer`, except that an
  attribute with no `sType` is `boolean` if its default is `true` or `false`, or if a set act sets
  it to the constant `true` or `false` (an integer could not be, so that is what was meant). Both
  cases have a note. Nothing in the Escape examples is affected.
- **An act held by another agent's group.** In the AMF movement test a flow that starts in one
  agent's rule goes on to acts held by another agent's group (`basicMovementAgent.moveTwice`
  targets `networkAgent.goalinArea2`). The generators follow flows from roots, so where an act is
  held does not matter to them, but the format keeps acts with their agent. The translation makes
  an act an act of the agent whose root its flow starts at, and says so with a `moved` note. An act
  reached from roots of different agents is an error. Moved acts come after the agent's own, and
  a moved act that was in a nested group is in the root group. No Escape example has one.
- **Methods.** Every method body in the models is Java. The body is kept as comment lines (`//`),
  after a first line saying it is Java to be ported by hand, so that the method act is in place;
  each has a warning. Leading whitespace of each line is trimmed. `generate` is dropped with a
  note.
- **Ported methods.** A body ported by hand to TypeScript is kept beside its example
  (`StupidModel5.ports.ts`), keyed by the XMI path of its method act, since the `.metaabm` file
  stays as it is and the `.model.json` is generated. The translation takes the port in place of
  the Java, with a `note` of the kind `ported`; a port whose path is not a method of the model is
  an error. `npm run translate-examples` applies the ports (`examples/escape/ports.ts` lists them).
- **Extensions.** A model that has an extension (`children`, an element of another metamodel, as
  in SIR's system dynamics) is not translated at all: no model, one error at the outermost
  extension element. Partial translation of SIR would leave something that can't run and is not
  SIR.
- **Arrays.** The grid's automatic `Dimensions` array is dropped with a note. Any other array
  attribute is dropped with a warning, and a reference to one is an error that leaves the act
  using it in a state the checker rejects (the AMF spatial test, for `withinBoundaries`).
- **Dimensions of a space.** The ordered size attributes are the space's attributes with the IDs
  `width`, `height` and `depth`, in that order, as the examples name them. A warning if their
  number is not the `dimensionality`. The size attributes stay ordinary attributes of the space.
- **Input selections.** An input's `selected` is kept only on an attribute value, and only where it
  differs from the selection of the act the input is of (which is the default). On other values
  (a literal, an option, an evaluate) it means nothing in the format, and a different one is
  dropped with a note. A value that is an act must be an evaluate.
- **Defaults and explicit values.** XMI leaves out a value that is the ecore default; the
  translation writes a flag (`directed`, `multiOccupant`, `gatherData`, `immutable`, `derived`)
  or a border rule only when the XMI does, since the format has the same defaults. A missing
  neighbourhood and a missing `sType` are written out, since the format requires a neighbourhood
  and a type. `units=""` is dropped.
- **States.** `sType` and `defaultValue` of a state are dropped: the type is `state`, and the
  default is `defaultOption`, which the XMI refers to by index (`@options.0`) and the translation
  by the option's ID. A warning if `defaultValue` is not the label of the default option.
- **Core constants.** `path` and `self`, the other attributes of the core library, are an error as
  values. The ID of a function is the last ID in its `href`.
- **`for` of a select.** Dropped. It never appears in the examples (`ONE` is the default and is
  left out). If it does, a warning if it disagrees with the select's `all` term, a note otherwise.
- **`agentCount` of a create.** Three creates in the examples have none. No template of the
  generators reads `agentCount`; it is kept as the XMI has it, and what a missing count means is
  the interpreter's to decide.
- **Source and target.** `sources` is derived from `targets` and not stored; the translation checks
  that the two agree and gives a warning where they do not. They always do in the examples.
- **IDs.** An ID that is not a letter or underscore followed by letters, digits and underscores is
  an error, and the element is left out. Duplicate IDs among siblings, and act IDs repeated
  within an agent, are errors. None occurs in the examples.
- **Implementation.** The `implementation` element of agents, styles and spaces is dropped with a
  note (R9). A `library` in a model is dropped with a warning.

Interpreter (`packages/spec/src/metamodel`: `interpreter.ts`, `flows.ts`, `runtime.ts`,
`functions.ts`, `method.ts`). Decided while implementing, where the guide, the generators and the
runtimes left the meaning open:

- **How a flow runs.** Depth first, as the generated code nests: an act fires for each frame (an
  agent with every selection bound on its path) that reaches it, then the flow goes on to its
  targets, in the order flows run (upstream first, then the order the acts are written). So sets
  inside an `all` selection accumulate, as they did in Ascape.
- **A select's region** (refines R18). The set a select chooses from is described by the queries
  reached from it through queries alone, where a query that is not spatial counts only straight
  from the select, and by the logic acts fed only by those. A query that is not spatial and follows
  another query filters what was chosen, as the generators had it: in the Demographic Prisoner's
  Dilemma one neighbour is chosen (`neighbor`), and its strategy is then tested on two branches.
  Read the other way, both branches would choose a neighbour of their own.
- **Spatial terms and logic acts.** Spatial terms say where to look and how many to choose; they
  are not operands of logic acts. Every spatial filter (`neighbor`, `within`, `here`, `available`,
  `location2D`) upstream of where a flow leaves the region holds for what is chosen there, and the
  logic acts combine the other queries. So a `none` beside an `all` term takes every candidate the
  other queries reject. This is the generators' reading (spatial terms went into the `find…` call,
  the rest into the condition).
- **Cardinality and modifiers** (`all`, `nearest`, `minimize`, `maximize`, `includeSelf`,
  `toward`, `away`) apply where the flow leaves the region if they are upstream of that place in
  the region. Ties are broken uniformly at random; `all` with `nearest`, `minimize` or `maximize`
  takes every one tied for best.
- **The origin.** A selection searches from the agent bound by the select's own selection, at its
  cell in a grid. With a term that places the search around it (`neighbor`, `within`, `nearest`,
  `minimize`, `maximize`, `here`), the origin, and its cell unless the term is `here`, are left out
  unless `includeSelf`; `includeSelf` lets them pass `neighbor` and `within`. Without such a term
  nothing is left out, as Ascape's `findRandom` did not.
- **`available`** is true of a cell with no occupant, or of any cell in a multi-occupant grid. Of
  an agent that is not a cell it is true. **`neighbor`** in a continuous space is "within 1".
- **Euclidean grids** have Moore neighbours and measure straight-line distance, as Ascape's
  `Array2DEuclidian` (the generator names a class `Array2DEuclidean`, which does not exist).
- **`toward` and `away`** change the move whose destination they choose: the mover steps one cell
  (one unit in a continuous space) toward or away from the agent chosen, if that cell is free.
- **Queries and logic acts after a select's region** (gates). A query fires for every frame that
  reaches it, as a plain act; a query reached along two paths decides twice, each time with what
  has changed in between (EpidemicRegional's first individual marks its city as the origin, and
  the query that follows is reached both from the initialize act and after that set). A logic act,
  and anything after one, is decided once, when the flow reaches the last act that feeds it, so
  that everything it combines is bound; if that act never fires (its select found nothing), the
  logic act does not either. Each arrival decides afresh, but the queries and `none`s of one
  arrival see the same results, so a random query is drawn once.
- **Attributes read with no selection named.** From the act's own selection if that agent has the
  attribute, else from the nearest selection on the path that does. Markets sets an instrument's
  offer price to `firm.lastPrice` within the selection of the instrument just created; the firm is
  the agent the flow runs for. Attributes of a scape or space are read from the one around the
  agent.
- **A set's parameter** with no selection named is the exception: an attribute of an agent is read
  from the agent the flow runs for (the root act's), if it has the attribute. In MetaABM a set's
  parameter is an attribute with no selection at all, and the generators read it from the root's
  selection (`selfrom(ASet)` in `infer.ext`; the generated Java for the Demographic Prisoner's
  Dilemma is `createAgents.setCooperate(isCooperate())`). Read from the act's own selection, a
  child there took its own default strategy rather than its parent's, every child defected, and
  the players died out. This is the only set in the Escape examples whose reading changes.
- **Numbers.** Integer arithmetic truncates, as Java's: `div` and `mod` of integers, with a clear
  error on division by zero; `pow` is a power (in the generated Java `^` was exclusive or). A set
  of an integer attribute truncates. A numeric constant (`zero`, `unit`) takes the type of the
  numbers beside it in a call: real if any is real, else integer if any is an integer.
- **Random functions** follow Ascape's `RandomFunctions`, which the generated code called:
  `randomInRange` of integers includes both ends and of reals excludes the upper one;
  `randomToLimit` of an integer is `nextInt(limit)`, from 0 to the limit exclusive, although the
  library's description says inclusive; of a real, from 0 to the limit exclusive. `randomIs` is a
  fair coin. Every draw uses the acting agent's stream, so runs are determined by the seed.
- **Distributions** (R22). For an additive parameter, the attributes listed are the base, then
  one per option of each state, states in order; for a cross parameter, one per combination of
  options, the first state varying slowest. A parameter listed as one attribute does not vary. Every
  multi-value in the Escape examples is one attribute or none, so the order is untested against
  an original.
- **`original`** is the value an attribute had once the model started (after build and
  initialize), or, for an agent created later, once its creating flow had run.
- **Colours** are those of `java.awt.Color`, which the generated code used (orange is 255, 200,
  0). AWT has no purple; it is 128, 0, 128. `colorRGB` clamps its inputs to 0..1 (AWT throws).
- **Styles.** The colour, shape, fill and outline each graphic function reaches are recorded as
  marks, in order (`styleOf`). The views draw an agent in the colour of its first filled mark,
  else its first mark, else a default colour for its type; occupants of a grid take the first
  shape of their type's style (oval as a circle, rectangle as a square).
- **Moves.** A move onto a taken cell of a single-occupant grid does nothing (Ascape threw). A
  move into a grid of another scape instance makes the agent a member of that scape, as the
  generator's code did. An agent placed in no grid by a builder act stands on one once moved there
  (EpidemicPlague's fleas).
- **Create.** Without `agentCount`, one agent is created, as the generated loop did. Creating the
  cell type of a grid creates nothing: a grid makes its cells (the generator skipped those
  creates). A created agent stands nowhere until moved; one in a continuous space is placed at
  random.
- **Leave** steps off the grid cell, or leaves the network, of the space its selection is in; in a
  continuous space it does nothing. **Die** of a cell is an error. **Disconnect** removes every link
  of the agent, as the generators' `clearNeighbors` did; in Markets a sale removes all of the
  seller's holdings from the network, as it did in the original. **Connect** with
  `directed: false` in a directed network links both ways.
- **Watch and derive** apply to attributes of the agent that has the act; the generators wired
  them only so, and the interpreter rejects others. A derive's value is the last evaluate without
  targets that its flow reaches, else the attribute's default. It is computed again when an
  attribute it read has changed, when agents have moved, been born, died or been linked if it
  looked at where agents are, or in a new period; otherwise it is kept.
- **Diffusion** (R17) is the generator's formula: new = own + rate × (mean of the neighbours −
  own), then × (1 − evaporation). With no rate a cell takes the mean; with no evaporation rate
  nothing evaporates. Setting the new value runs watches (Heatbugs clamps its heat so). The engine
  applies every two-phase rule's update after every rule's execute, where Ascape updated after each
  rule; the Escape examples have one rule on their cells.
- **Order of scapes.** Each period the root scape's own rules run first (on a scape whose one
  member is the root scape, as the generator's manager scape), then the scapes of grid cells and
  networks in the order the spaces are declared, then the populations in the order the agents are
  declared; a nested scape's spaces and populations run after its own population's rules. Ascape
  added grids before agent populations too.
- **Schedules** run from `start` (default 0) every `interval` (default 1) periods; `priority` and
  `pick` are ignored. No example has one.
- **Parameters** are the root scape's attributes and its spaces' (`grid2D.width`). Attributes of a
  nested scape start at their defaults in each instance. Statistics are collected for the root
  scape's own gathered attributes and for the populations of its agents (a count, and the gathered
  attributes, as Ascape's CSAMM statistics); nested scapes' populations are not collected yet.
  Each instance of a nested scape made while the model is built gets views of its spaces.
- **Not run yet**: geography, value layers, shaped and loaded agents, shape styles, extensions, an
  agent on two grids or in a grid and a continuous space, spaces of more than two dimensions, and
  builder acts of agents that are not scapes. The interpreter lists what a model uses of these in
  one error.

The catalogue (`packages/models/src/amp`), decided while replacing the code ports:

- **What a family adds** is not part of the model: the name the catalogue knows it by (so that
  Studio's addresses stay), its provenance, attributes to gather statistics on besides those the
  original gathers, and charts, with their series named from the model's labels. It lives in each
  family's `index.ts` until curation has a model of its own (R24). The extra gathered attributes
  (bug size and habitat food in StupidModel 2, 3 and 5, cell heat in Heatbugs) only record values;
  without them the StupidModel charts would show a count that never changes.
- **Models with no counterpart.** "Epidemic (AMP): Regional Periods" was `EpidemicPeriods.java`, a
  Java subclass of the Regional model with other parameter values and a stop period. It has no
  `.metaabm` original and is gone; it is a run spec (R24).
- **SIR** stays a code port until the system dynamics extension is ported (R10).
- **Compared with the code ports.** Every model opens and runs in Studio. Demographic Prisoner's
  Dilemma died out until a set's parameter was read as the generators read it (above); it now
  grows to about 340 players, as the port did, and like the port it dies out early on some seeds.
  Epidemic (AMP): Regional has no chart, since nested scapes' populations have no statistics yet.
  Wiki Example has no chart: its original gathers only a constant count, and the port's
  same-age-neighbour measure was an addition. Markets charts firm prices, earnings and trader
  funds, not the port's count of instruments with a holder, which was an addition too.

The examples written for Metascape (`packages/spec/src/metamodel/examples`), rewritten from the
earlier format. What that format had and this one does not was not added; where an example
needed it, the example was left out or does without, as listed:

- **Left out: the small-world Epidemic.** Its network was made by a generator
  (`initial: { topology: 'smallWorld', k, probability }`), which the format does not have: networks
  are built by connect acts (R20). Each day a few people dropped one contact and met a stranger;
  a disconnect removes every link of an agent (as `clearNeighbors` did), so dropping one link has
  no counterpart either.
- **Left out: Pursuit.** Prey and hunters in a continuous space moved by a heading and a speed
  (`moveBy` with `dx` and `dy`, `moveToward` a given distance, fleeing as a negative distance).
  A move goes to a chosen agent, or one unit toward or away from it (`toward`, `away`); there is
  no move by a vector or a speed.
- **Stopping on a condition** (R24). Schelling stopped once everyone was happy and Foragers once no
  forager was left. The rewrites do not stop; their tests check that everyone ends up happy
  rather than that the run stops.
- **Aggregates** (`count`, `mean`, `max` over a selection) are flows: every agent of an `all`
  selection flows on to a set that adds one (Life's live neighbours, Schelling's neighbours and
  neighbours of the same group), after a set that clears the count. A share is one count over the
  other, and zero with no neighbours, as the earlier format's mean of nothing was.
- **Life's synchronous rule** is two rules, Count and Update. Rules run across every cell before
  the next starts (R14), so every cell counts before any changes, and the order cells act in does
  not matter (tested).
- **Grid sizes** are the space's own attributes (`world.width`, `world.height`), not one `size`
  parameter, and Schelling's number of residents is worked out by evaluates in its build act.
- **Foragers.** A forager moves to the free neighbouring patch with the most food among those with
  more than its own, which is the earlier version's move. It halves its energy only when a child
  is born; the earlier version halved it whenever it had enough, child or not. The "Show foragers"
  parameter hid the foragers in the view; a style cannot hide an agent, and the parameter is gone.
  The test that a grid too small for the foragers gave an error is gone: the interpreter places
  the foragers it can, as Ascape did.
- **Charts** of the examples are curation (R24), held by Studio's "Written as data" family
  (`apps/studio/src/catalog/data-family.ts`), not by the model.
- **Numbers.** The rewrites give numbers close to the earlier versions' (Foragers about 390 at
  period 180 in both; Schelling settles at a share of about 0.75 of similar neighbours), not the
  same ones: random draws are made in other places and orders. Their numbers are pinned again.

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

1. Settle the review items. Still open: R21's method API (proposed), and where condition-based
   stopping belongs (R24).
2. **Format:** types and Zod schemas for structure, functions and acts; the checker (references,
   types of inputs against function prototypes, acyclic flows, boundaries). _Done._
3. **Core library:** `core_library.metaabm` translated to data, with TypeScript implementations
   of every function (`functions.ts`). _Done._
4. **Interpreter:** acts compiled once into closures over the engine, following the semantics
   above (`compileModel`). _Done._ The twelve translated Escape examples run and are tested.
5. **Translation:** `.metaabm` → format, with diagnostics for anything dropped or not supported.
   _Done_ (`packages/spec/src/metaabm`). Its tests are the twelve Escape examples, which all
   translate and check without errors or warnings besides one Java method (StupidModel5) and one
   disconnect destination (Markets), and the AMF test models (`TestBasics` and `TestMovement`
   translate and check; `TestSpatial` needs arrays, which the format does not have; SIR needs the
   system dynamics extension and is reported as unsupported).
6. **Examples:** the Escape examples are imported, with their `.metaabm` originals and the
   generated translation beside each (`packages/spec/examples/escape`, regenerated by `npm run
translate-examples`). The AMP models of the catalogue are these translations, run by the
   interpreter; the code ports in `packages/models/src/amp` are deleted except SIR's (R10), and
   StupidModel5's Java method is ported beside its example. The earlier format's examples are
   rewritten in the format where it can hold them (Life, Schelling, Foragers, in
   `packages/spec/src/metamodel/examples`), Studio's "Written as data" family runs them, and the
   earlier format is removed: `@metascape/spec` is the format. Epidemic and Pursuit are left out
   (Ambiguities). _Done._

7. **Run specs and curation** (R24), after the examples run: port APar and ATest, and move charts
   into the curation model.

The Brookings and Ascape ports are unaffected: their originals are Java, not MetaABM.
