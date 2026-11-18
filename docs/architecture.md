# Architecture

Metascape keeps the core architecture of Ascape. Its shape is set by the three abstractions of
Miles T. Parker, "Ascape: Abstracting complexity", _Natural Resources and Environmental Issues_
8 (2001), article 5 (a scan is in [`Ascape_ Abstracting complexity.pdf`](Ascape_%20Abstracting%20complexity.pdf)):

1. All scapes are themselves agents.
2. Scape structure is hidden from agents.
3. Behaviors occur across scapes, as rules.

This page says how `@metascape/engine` realises each one. The words are Ascape's: a model is
built from scapes, a scape has a space, rules are iterated across its members, and one
iteration of the model is a period.

## 1. All scapes are themselves agents

The class hierarchy follows Ascape's:

```
Agent
└─ LocatedAgent        a place in a space
   └─ Cell             neighbors
      ├─ HostCell      can be stood on
      └─ CellOccupant  stands on a host cell
         └─ Scape      a collection of agents, and an agent
            └─ RootScape
```

Because `Scape` is a `CellOccupant`, a scape can be a member of another scape and can stand on a
host cell. A model is a composite: "the base model is defined to be root, and is just another
scape within the model" (p. 25). `defineModel` declares the parameters and a `build` function,
and `build` is given the `RootScape`. It adds scapes to the root (and, if it likes, scapes to
those), and to each scape its rules, statistics and views. There is no other object in a model:
the parameters, the period counter, the seed and the random stream that every scape's stream is
forked from all belong to the root.

An agent has one parent scape, its behavioural context (`agent.scape`), and may be a member of
others: `scape.add(agent, false)` makes an agent that lives elsewhere a member too, as the
paper's household belongs to both a settlement and the households vector (p. 25). A `Graph`
space does this for the agents it links.

"A complete tour of the model is always well defined" (p. 25). Everything the model does as a
whole is a rule executed on the root and passed down the hierarchy (`propagate` in `scape.ts`),
as in Ascape's `Runner`: populate, initialize, initial rules; then each period, the scapes'
rules, statistic collection and listener notification. "All Ascape system behaviors, such as
statistic collection and visualization, are managed by the same rule mechanism" (p. 25), so
statistics (`addStatCollector`) and views (`addView`) belong to scapes, and the root's
`DataGroup` only stores what the scapes collect.

## 2. Scape structure is hidden from agents

A scape holds a `Space`, its topology, given as an option and replaceable by another:
`ListSpace` (the default), `Array2DMoore`, `Array2DVonNeumann`, `Graph`, `Continuous2D` and
`Singleton`. "It should be possible to change the entire geometry with a single statement
change" (p. 26): changing the `space:` option is that statement.

Agents use calls that name no topology, and the space answers in its own terms:
`findWithin(distance)`, `countWithin`, `findNearest`, `findMaximumWithin(value, distance)`,
`findMinimumWithin`, `findRandomNeighbor`, `neighbors`, `distanceTo`, `moveToward`, `moveAway`,
`randomWalk`, `randomWalkAvailable`, `moveToRandomLocation` and `isAvailable`. On a lattice a
distance is cells, on a graph links, in a list places and in a continuous space length.
"Algorithms that relate to scape structure are actually built within the scape, where they
belong" (p. 26): searching, neighbourhoods, wrapping and the spatial index live in the spaces.

A `CellOccupant` asks the space of its host scape, never its own, so the same occupant code
walks a Moore lattice, a von Neumann lattice or a graph of cells.

## 3. Behaviors occur across scapes, as rules

"Ascape supports only the iteration of rules across members of a scape" (p. 28). A model behaves
only through rules (`addRule`) and initial rules (`addInitialRule`) of its scapes. A behaviour
of the model as a whole, such as wiring a network after every agent exists or stopping once a
condition holds, is a rule of a scape with a `Singleton` space, whose only member is itself, or
a rule of the root, which is iterated across the root's scapes.

Work a scape does once each period's statistics are collected, which an Ascape model does in
its `scapeIterated`, goes in the scape's self view (`setSelfView`), as Ascape's
`createSelfView` makes a scape a view of itself. The self view is told of the scape's events
before its other listeners, in the same propagated notification that follows statistic
collection. Listeners (`addScapeListener`) are for the run time and for views.

A rule object can be added to more than one scape, and rules "carry important information of
their own" (p. 28): `randomExecution` (whether the rule needs its agents in a fresh random
order) and `causesRemoval` (whether it may remove agents). The scape uses both: it draws a
random tour only when a selected rule needs one, and checks membership between rules only when
a rule may remove agents. A rule with `update` is executed then updated, as Ascape's
`ExecuteThenUpdate`: its update runs after every rule's execute, as Ascape's execution strategies
did (`StrategyFactory` chains the update strategy after the main one), owner's decision,
2026-11-17.

Ascape has two ways of ordering agents when executing by rule. Its execution strategies, used
for each iteration, draw one random order for all the rules when any needs one; the engine does
the same by default. Its `Scape.execute(rules, agents)` draws a fresh order for each random rule;
a scape made with `randomOrderPerRule` does that instead, and visits the members in order of
joining for the rules that are not random. (Ascape keeps the last random rule's order for them.)

Initial rules run on the initial population and, as in Ascape, on every agent added while the
model runs. A scape made with `initialRulesAtStartOnly` runs them only at the start, for
families whose agents are born in place, such as cloned citizens or bions born by fission.

The run-time control of the paper's Figure 4 is kept per scape (`settings.ts`): select and order
the rules, the execution order (`byAgent` or `byRule`), the execution style (`completeTour` or
`repeatedDraw`) and the agents per iteration.

## The model format

A model written as data in `@metascape/spec` has the same structure. Each agent type is a scape of
the root named after it, whose members are the agents of that type, with an `executionOrder`; each
of its rules says whether it needs `randomExecution`, and expressions read the current `period`.
What the model does as a whole, such as stopping once a condition holds, is a rule of a scape
declared under `scapes`: the interpreter gives each a `Singleton` space and adds it after the
agent types' scapes, so its rules execute once per period with no acting agent. Network wiring is
an initial rule of the root.

`compileModel` makes those rules from the model's acts once, when the model is compiled, in one of
two ways that give the same run: JavaScript generated from the acts and made with `new Function`
(the default, `docs/codegen.md`), or closures of the interpreter (`execution: 'interpreted'`), which
also run any act the generator leaves. Both run on the engine like any other model.

## Outside the model

`Runner` drives a model interactively and `runExperiment` runs it in batches. They are run-time
plumbing, not structure: each run is a fresh `RootScape`. Parameters are properties of the
model that can be set at any time with `root.setParameter`; a parameter declared `live` is one
the model reads as it runs, and tools use that flag to decide whether a change needs a restart.

## Determinism

A run is fully determined by its model, parameters and seed. The root's stream is seeded, each
scape forks its own from its parent's when it is added (a `Singleton` scape, or one made with
`randomStream: 'parent'`, shares its parent's instead), and nothing in the engine or the models
uses `Math.random`.
