# Migration notes (temporary)

The engine was restructured to follow Ascape's architecture, and every package has since been
moved onto it: the engine, the eight introductory models, every ported family, the spec
interpreter, `@metascape/react` and Studio. This file records the old-to-new mapping for the
model format's redesign and for anyone reading old code or links; delete it once the format is
redesigned. The design is in [architecture.md](architecture.md).

**The invariant held.** Every model gives exactly the numbers it gave before. Every model
of the catalogue and the five spec examples were checked byte for byte against the
old engine: the full data CSV, the final period, and the stop reason, for the default
parameters and every exploration, with several seeds. To repeat the check: export
the commit from before the change (`git archive a159b55 packages | tar -x -C <scratch>`), alias
`@metascape/engine` to the exported engine in a scratch vitest config, write the outputs, and
compare. The only textual difference in the CSV is the first header field, `tick` → `period`.

## Old to new

### Model and root

| Old                                                                        | New                                                                                                 |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `Simulation`                                                               | `RootScape` (a `Scape`: the root of the model's hierarchy, and one run)                             |
| `new Simulation(model, options)`                                           | `new RootScape(model, options)`                                                                     |
| `SimulationOptions` `{ seed, parameters, stopAt }`                         | `RootOptions` `{ seed, parameters, stopPeriod, history }`                                           |
| `Model.build(sim)`                                                         | `Model.build(root)`                                                                                 |
| `Model.views(sim)`                                                         | `Model.views(root)`                                                                                 |
| `Model.time` (`TimeScale`: `unit`, `plural`, `origin`, `originOf`, `step`) | `Model.period` (`PeriodScale`: `name`, `plural`, `start`, `startOf`); `step` is gone (never used)   |
| `timeAt(sim, tick)`                                                        | gone: `root.period` and the recorded periods (`root.data.periods`) already are model time           |
| `sim.parameters`                                                           | `root.parameters` (also `scape.root.parameters`, `agent.root.parameters`)                           |
| `sim.setParameter(name, value)`                                            | `root.setParameter` (any parameter, at any time); `Runner.setParameter` still refuses non-live ones |
| `sim.tick`                                                                 | `root.iteration` (iterations executed) or `root.period` (= `startPeriod` + `iteration`)             |
| `sim.step()`                                                               | `root.iterate()`                                                                                    |
| `sim.run(n)`                                                               | `root.run(n)`                                                                                       |
| `sim.stop(reason)`, `stopped`, `stopReason`                                | same names on `root`                                                                                |
| `sim.random`                                                               | `root.random`                                                                                       |
| `sim.seed`, `sim.model`                                                    | `root.seed`, `root.model`                                                                           |
| `sim.addScape(scape)`                                                      | `root.add(scape)` (or `parentScape.add(scape)` for a nested scape)                                  |
| `sim.scape(name)`                                                          | `root.findScape<AgentClass>(name)` (typed; also on any scape, searching below it)                   |
| `sim.scapes`                                                               | `root.scapes`: every scape of the hierarchy, each before those in it, root excluded                 |
| `sim.data`                                                                 | `root.data` (a `DataGroup`); declare statistics on scapes, see below                                |
| `sim.addView(view)`                                                        | `scape.addView(view)` on the scape it shows (`root.addView` for model-wide charts)                  |
| `sim.views`                                                                | `root.allViews` (`scape.views` is one scape's own)                                                  |
| `sim.setup(fn)`                                                            | not mechanical: an initial rule, see below                                                          |
| `sim.observe(observer)`                                                    | not mechanical: a rule; `root.addScapeListener` only for run time and views, see below              |
| `SimulationObserver` `initialized/stepped/stopped`                         | `ScapeListener` `scapeInitialized/scapeIterated/scapeStopped`, called with the scape                |
| `sim.nextAgentId()`                                                        | engine-internal (`root.nextAgentId`); scapes are numbered separately, so agent ids are unchanged    |

### Agents

| Old                                                          | New                                                                                                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `Agent.sim`                                                  | `agent.root`                                                                                                                  |
| `Agent.scape`, `random`, `die`, `initialize`, `removed`      | unchanged                                                                                                                     |
| `Cell` (hosted occupants)                                    | `HostCell` for any cell that can be stood on; `Cell` is a site with neighbors only                                            |
| `cell.grid`                                                  | `cell.scape` (its lattice is `cell.scape.space`)                                                                              |
| `cell.neighbors`, `occupants`, `occupant`, `isAvailable`     | unchanged (`occupants`/`occupant` on `HostCell`)                                                                              |
| `Occupant<C>`                                                | `CellOccupant<H extends HostCell>`                                                                                            |
| `occupant.cell`                                              | `occupant.hostCell`                                                                                                           |
| `occupant.moveTo(cell)`, `leave()`, `neighboringOccupants()` | unchanged                                                                                                                     |
| `occupant.moveToRandomAvailableNeighbor()`                   | `randomWalkAvailable()` (the same single draw from the occupant's stream)                                                     |
| `moveTo(random.pick(cell.neighbors))`                        | `randomWalk()` (one `pick`; moves if the cell is free or the lattice is multi-occupancy)                                      |
| place on a random free cell, else die                        | `moveToRandomLocation()`, with `occupant.hostScape = cellsScape` (draws from the host scape's stream)                         |
| `occupant.neighbors`                                         | new: the occupants of the neighboring cells (not the cells)                                                                   |
| `PointAgent`                                                 | `LocatedAgent` (`x`, `y`, `moveTo(x, y)`, `moveBy`, plus `findWithin`, `findNearest`, `distanceTo`, `moveToward`, `moveAway`) |

### Scapes

| Old                                                                                                               | New                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ScapeOptions.create(index)`                                                                                      | `prototypeAgent(index)`                                                                                                                             |
| `ScapeOptions.size`                                                                                               | unchanged (for list, graph and continuous spaces)                                                                                                   |
| `ScapeOptions.order: 'shuffled'`                                                                                  | the default: rules have `randomExecution` true                                                                                                      |
| `ScapeOptions.order: 'sequential'`                                                                                | not mechanical: `randomExecution: false` on every rule and initial rule of the scape                                                                |
| `ScapeOptions.schedule` (`Schedule`)                                                                              | `executionOrder` (`ExecutionOrder`: `'byAgent' \| 'byRule'`)                                                                                        |
| `ScapeOptions.sampling` (`Sampling`) `'tour'` / `'draw'`                                                          | `executionStyle` (`ExecutionStyle`) `'completeTour'` / `'repeatedDraw'`                                                                             |
| `ScapeOptions.activations`                                                                                        | `agentsPerIteration`                                                                                                                                |
| `scape.order`, `schedule`, `sampling`, `activations`                                                              | `executionOrder`, `executionStyle`, `agentsPerIteration`; no visit order                                                                            |
| `scape.spawn()`                                                                                                   | `scape.newAgent()`                                                                                                                                  |
| `scape.randomMember(condition)`                                                                                   | `scape.findRandom(condition)` (same draw)                                                                                                           |
| `scape.add`, `remove`, `members`, `size`, `filter`, `count`, `rules`, `initialRules`, `addRule`, `addInitialRule` | unchanged; `add(agent, false)` adds a further, non-parent membership; `addRule(name, fn, options)` takes `RuleOptions`                              |
| `scape.sim`                                                                                                       | `scape.root`                                                                                                                                        |
| `scape.attach`, `populate`, `initializeMembers`, `runInitialRules`, `step`, `onAdded`, `onRemoved`                | engine-internal: `populate`, `initializeMembers`, `executeInitialRules`, `executeOnMembers`; subclass hooks are now the space's `added` / `removed` |
| `Rule`, `RuleEntry`                                                                                               | unchanged, plus optional `randomExecution` and `causesRemoval` (both default true)                                                                  |
| `VisitOrder`                                                                                                      | gone                                                                                                                                                |

### Spaces

| Old                                                                                                                                                      | New                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `new GridScape({ name, width, height, wrap, neighborhood, multiOccupancy, create })`                                                                     | `new Scape({ name, space: new Array2DMoore({ multiOccupancy }) \| new Array2DVonNeumann(...), extent: [width, height], periodic: wrap, prototypeAgent })` |
| `GridScapeOptions`                                                                                                                                       | `ScapeOptions` + `Array2DOptions`                                                                                                                         |
| `create(x, y)`                                                                                                                                           | `prototypeAgent(index)` with `x = index % width`, `y = Math.floor(index / width)`; without one the cells are `HostCell`s                                  |
| `grid.at`, `neighbors`, `setNeighbors`, `distance`, `rays`, `toward`, `away`, `width`, `height`, `wrap`, `neighborhood`, `defaultMetric`                 | the same on the space: `(scape.space as Array2D<C>).at(...)`                                                                                              |
| `grid.within(cell, r, options)`                                                                                                                          | `space.findWithin(cell, r, options)` (options add `condition`) or `cell.findWithin(r)`                                                                    |
| `grid.nearest(cell, condition, max)`                                                                                                                     | `space.findNearest(cell, condition, max)` or `cell.findNearest(condition, max)`                                                                           |
| `grid.randomCell(condition)`                                                                                                                             | `scape.findRandom(condition)`                                                                                                                             |
| `grid.randomAvailableCell()`                                                                                                                             | `space.findRandomAvailable()` or `scape.findRandom((c) => c.isAvailable)` (same draw)                                                                     |
| `grid.multiOccupancy`                                                                                                                                    | `space.multiOccupancy`                                                                                                                                    |
| `new ContinuousScape({ name, width, height, wrap, cellSize, size, create })`                                                                             | `new Scape({ name, space: new Continuous2D({ cellSize }), extent: [width, height], periodic: wrap, size, prototypeAgent })`                               |
| `ContinuousScapeOptions`                                                                                                                                 | `ScapeOptions` + `Continuous2DOptions`                                                                                                                    |
| `cs.within(origin, r, condition)`                                                                                                                        | `space.findWithin(origin, r, condition)` (or options `{ condition, includeSelf }`), or `agent.findWithin(r)`                                              |
| `cs.countWithin`, `normalize`, `randomPoint`, `displacement`, `distance`, `heading`, `moveToward`, `moveAway`, `width`, `height`, `wrap`                 | the same on `Continuous2D`                                                                                                                                |
| `cs.nearest(origin, condition, max)`                                                                                                                     | `space.findNearest(...)` or `agent.findNearest(...)`                                                                                                      |
| `cs.relocate(agent, x, y)`                                                                                                                               | `space.moveTo(agent, x, y)` (or `agent.moveTo(x, y)`)                                                                                                     |
| `new Network({ directed })`                                                                                                                              | `new Graph({ directed })`, the space of a scape, see below                                                                                                |
| `NetworkOptions`                                                                                                                                         | `GraphOptions`                                                                                                                                            |
| `network.within(a, hops)`                                                                                                                                | `graph.findWithin(a, hops)`                                                                                                                               |
| `connect`, `disconnect`, `isConnected`, `neighbors`, `inNeighbors`, `degree`, `edges`, `edgeCount`, `disconnectAll`, `clear`, `distance`, `shortestPath` | unchanged on `Graph`                                                                                                                                      |
| `connectRing`, `connectRandom`, `connectSmallWorld`                                                                                                      | unchanged, taking a `Graph`                                                                                                                               |
| `wireSmallWorld(grid, options)`                                                                                                                          | `wireSmallWorld(lattice, options)` with the `Array2D` space; call it from an initial rule                                                                 |
| `diffusion(options)`                                                                                                                                     | unchanged, but the rule now says `randomExecution: false, causesRemoval: false`; see below                                                                |
| `Point`, `Displacement`, `Metric`, `Neighborhood`, `WithinOptions`, `SmallWorldOptions`, `DiffusionOptions`                                              | unchanged names (`WithinOptions<C>` is generic)                                                                                                           |

### Statistics

| Old                                                                                                                  | New                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `DataRecorder`                                                                                                       | `DataGroup`, owned by the root (`root.data`); it no longer declares anything |
| `new DataRecorder(sim, { history })`                                                                                 | `new RootScape(model, { history })`                                          |
| `sim.data.count(scape, name, condition)`                                                                             | `scape.addStatCollector(stat.count(name, condition))`                        |
| `sim.data.measure(scape, name, fn, options)`                                                                         | `scape.addStatCollector(stat.measure(name, fn, options))`                    |
| `sim.data.distribution(scape, name, fn, options)`                                                                    | `scape.addStatCollector(stat.distribution(name, fn, options))`               |
| `sim.data.value(name, (sim) => ...)`                                                                                 | `scape.addStatCollector(stat.value(name, (scape) => ...))`; see below        |
| `MeasureHandle`, `DistributionHandle`                                                                                | `MeasureCollector` (with `seriesFor`), `DistributionCollector`               |
| `RecorderOptions`                                                                                                    | `DataOptions`                                                                |
| `data.ticks`                                                                                                         | `data.periods` (the period of each sample)                                   |
| `data.latest`, `values`, `get`, `series`, `sampleCount`, `distributionCounts`, `distributionInfo`, `toCSV`, `toRows` | unchanged; CSV header and row key `tick` → `period`                          |
| `data.detach()`                                                                                                      | gone                                                                         |
| `Statistic`, `SeriesStatistic`, `Series`, `MeasureOptions`, `DistributionOptions`, `DEFAULT_STATISTICS`              | unchanged                                                                    |

### Views

| Old                                         | New                                                 |
| ------------------------------------------- | --------------------------------------------------- |
| `GridViewSpec.grid`                         | `GridViewSpec.scape` (the scape of cells)           |
| `ContinuousViewSpec.scape: ContinuousScape` | `scape: Scape<A>` with a `Continuous2D` space       |
| `NetworkViewSpec.network`                   | `NetworkViewSpec.graph`                             |
| `gridView<C, O extends Occupant<C>>`        | `gridView<C, O extends CellOccupant<C & HostCell>>` |
| `continuousView<A extends PointAgent>`      | `continuousView<A extends LocatedAgent>`            |
| everything else in `view/`                  | unchanged                                           |

### Run time and settings

| Old                                                                 | New                                                                                                              |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `runner.sim`                                                        | `runner.root`                                                                                                    |
| `RunnerOptions.ticksPerSecond`, `runner.ticksPerSecond`             | `iterationsPerSecond`                                                                                            |
| `RunnerOptions.stopAt`                                              | `stopPeriod` (compared with `root.period`, not iterations)                                                       |
| `RunnerOptions.pauseAt`, `runner.pauseAt`                           | `pausePeriod` (a period)                                                                                         |
| `RunnerOptions.onSimulation(sim)`                                   | `onRoot(root)`                                                                                                   |
| `onFrame((sim) => ...)`                                             | `onFrame((root) => ...)`                                                                                         |
| `ExperimentDesign.maxTicks`                                         | `maxIterations`                                                                                                  |
| `ExperimentDesign.setup(sim)`                                       | `prepare(root)`                                                                                                  |
| `ExperimentDesign.measure(sim)`                                     | `measure(root)`                                                                                                  |
| row columns `ticks`, stop reason `'maxTicks'`                       | `iterations`, `'maxIterations'`                                                                                  |
| `ScapeSettings` `{ rules, schedule, order, activations, sampling }` | `{ rules, executionOrder, executionStyle, agentsPerIteration }`                                                  |
| `SimulationSettings`                                                | `ModelSettings`                                                                                                  |
| `readSimulationSettings(sim)`, `applySimulationSettings(sim, s)`    | `readModelSettings(root)`, `applyModelSettings(root, s)`; they cover every scape, and the root when it has rules |
| `SettingsStore.attach/set/reset/defaultsOf(sim, ...)`               | the same with `root`                                                                                             |
| `ruleKey`, `RuleSetting`, `readScapeSettings`, `applyScapeSettings` | unchanged names                                                                                                  |

Unchanged exports: `Random`, `RandomState`, the parameter helpers and types, `ParameterError`,
`resolveParameters`, `defineModel`, `Provenance`, `Exploration`, `ExplorationRules`, the colour
helpers, `range`, `rowsToCSV`, `runExperiment`, `experimentRuns`, the schedulers and clocks.
New exports: `RootScape`, `LocatedAgent`, `HostCell`, `CellOccupant`, `Space`, `ListSpace`,
`Singleton`, `Array2D`, `Array2DMoore`, `Array2DVonNeumann`, `Continuous2D`, `Graph`, `stat`,
`propagate`, `ScapeListener`, `RuleOptions`, `PeriodScale`, `RootOptions`, `Extent`,
`Geometry`, `FindOptions`, `SpaceSetup`.

## One model, before and after

The epidemic model, which used every construct that is not mechanical. Before:

```ts
build(sim) {
  const p = sim.parameters;
  const people = sim.addScape(
    new Scape<Person>({ name: 'people', size: p.population, create: () => new Person() }),
  );
  const network = new Network<Person>();
  sim.setup(() => {
    const members = [...people.members];
    connectSmallWorld(network, members, p.k, p.rewire, people.random);
    for (const person of members) person.contacts = network.neighbors(person);
    const order = people.random.shuffle([...members]);
    for (const person of order.slice(0, Math.min(p.initialInfected, order.length))) {
      person.health = person.nextHealth = Health.Infected;
      person.everInfected = true;
    }
  });
  people.addRule({ name: 'epidemic', execute(person) { /* reads sim.parameters */ }, update /* ... */ });
  sim.data.count(people, 'infected', (a) => a.health === Health.Infected);
  sim.observe({
    stepped(s) {
      if (s.data.latest('infected') === 0) s.stop('no one is infected');
    },
  });
  sim.addView(networkView<Person>({ title: 'Contact network', nodes: people, network /* ... */ }));
}
```

After (`packages/models/src/epidemic/epidemic.ts`):

```ts
build(root) {
  const p = root.parameters;
  const people = root.add(
    new Scape<Person>({
      name: 'people',
      space: new Graph<Person>(),
      size: p.population,
      prototypeAgent: () => new Person(),
    }),
  );
  const contacts = people.space as Graph<Person>;
  people.addRule({ name: 'epidemic', execute(person) { /* reads root.parameters */ }, update /* ... */ });
  people.addStatCollector(stat.count('infected', (a) => a.health === Health.Infected));

  // The outbreak as a whole, added after `people`, so its rules run after theirs.
  const outbreak = root.add(new Scape({ name: 'outbreak', space: new Singleton() }));
  outbreak.addInitialRule('wire and seed', () => { /* the old setup body, on `contacts` */ },
    { randomExecution: false });
  outbreak.addRule('stop when over', () => {
    if (people.count((a) => a.health === Health.Infected) === 0) root.stop('no one is infected');
  }, { randomExecution: false, causesRemoval: false });
  people.addView(networkView<Person>({ title: 'Contact network', nodes: people, graph: contacts /* ... */ }));
}
```

## What is not mechanical

**Random streams.** Each scape forks its stream from its parent's when it is added, so the order
of `root.add` calls is the order of forks, as `sim.addScape` was. A scape added only to hold a
rule of the model as a whole must not fork: a `Singleton` space never does, and any other scape
can be made to share with `randomStream: 'parent'`. Adding a forking scape anywhere before
another shifts that other scape's stream.

**Visit order is per rule.** There is no scape-level `order`. A scape draws a random tour for an
iteration when any selected rule has `randomExecution` true (the default), as `'shuffled'` did,
and none when all say false, as `'sequential'` did. For a scape that was `'sequential'`, mark
every rule and initial rule `randomExecution: false`. A partial tour (`agentsPerIteration` below
the population) is shuffled whatever the rules say, as before. `diffusion()` now declares
`randomExecution: false`; if it is the only selected rule of a scape that was `'shuffled'`, use
`{ ...diffusion(options), randomExecution: true }` to keep the shuffle and its draws. Studio's
visit-order control has no engine counterpart any more.

**`sim.setup` becomes an initial rule.** It ran after every scape's initial rules. Initial rules
run scape by scape in hierarchy order, the scapes in a scape before its own, so an initial rule
of a `Singleton` scape added after the scapes it reads runs at the old moment. Alternatively, an
initial rule of the root runs after every scape's (the spec interpreter wires networks that way:
the root's rules are executed on its member scapes, so the rule acts when it reaches the right
one). Give it `randomExecution: false`.

**Observers that behave become rules.** A `stepped` observer that stops the model or changes
state becomes a rule of a `Singleton` scape added after every scape it reads; an `initialized`
one becomes that scape's initial rule. Rules run before statistics are collected, so a rule must
compute from the agents what the observer read from `data.latest` (the current period's value is
not there yet); the agents are in the same state either way. Observers that only refresh views or
read results can stay, as `root.addScapeListener`; listeners are told after statistics are
collected, as observers were.

**Calculated values.** `stat.value` is calculated after the statistics of its scape's members
and of every scape below it. One that reads other scapes' series with `data.latest` belongs on
the root, which is calculated last; one that reads only its own members can go on their scape.
The compute function receives the scape it is added to, not the old `sim`.

**Networks.** A `Network` that linked the members of one scape becomes that scape's space
(`space: new Graph()`), as in the epidemic model. One that links agents which already have a
space (cells, points) becomes a scape of its own with a `Graph` space and
`randomStream: 'parent'`; `connect` makes each linked agent a further member of it, and its
death removes it. Views take `graph:`.

**Lattice cells.** A grid's `create(x, y)` becomes `prototypeAgent(index)`. Cell classes that are
stood on must extend `HostCell`. Agents placed with `grid.randomAvailableCell()` can use
`moveToRandomLocation()` with `hostScape` set, which makes the same draw and also dies when no
cell is free; check that the model died there before (Prisoner's Dilemma did, Heatbugs and
Sugarscape did, Wolf–Sheep used `randomCell()` without dying).

**Time.** `root.period` is `startPeriod + iteration`. For a model with a start period (the four
Anasazi models start at `startYear`), code that read `sim.tick` as a count must read
`root.iteration`, and `stopPeriod` / `pausePeriod` in a runner are periods, so an old
`stopAt: n` becomes `stopPeriod: start + n`. `data.periods` holds periods: the catalogue test's
`timeAt(sim, sim.data.ticks[i])` becomes `root.data.periods[i]`.

**Parameters.** `root.setParameter` accepts any parameter; only `Runner.setParameter` refuses one
that is not `live`. The engine test that expected a throw for a non-live parameter now expects
the value to change; the Runner test that expects the refusal is unchanged.

**Scape names.** Every scape a model adds is a scape of the model: the new `Singleton` and graph
scapes appear in `root.scapes`, in `readModelSettings` and in Studio's rule editor. Their names
are visible to users.

## The model format

This section describes the format `@metascape/spec` had before 2026-11-17. It has since been
replaced by the format taken from the MetaABM metamodel (`docs/metamodel-review.md`), and its
examples rewritten in that format (`packages/spec/src/metamodel/examples`).

The format in `@metascape/spec` now says what the engine says. There is no reader for the old
field names; a model that uses them fails to parse.

| Old                                    | New                                                                                                                               |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| agent type `order: 'shuffled'`         | the default: rules have `randomExecution` true                                                                                    |
| agent type `order: 'sequential'`       | `randomExecution: false` on each of the type's rules; `initialize` always runs in a random order                                  |
| agent type `schedule`                  | `executionOrder` (`'byAgent' \| 'byRule'`)                                                                                        |
| the `tick` variable                    | `period`                                                                                                                          |
| model `stopWhen: condition`            | a rule of a scape of the model as a whole: `scapes: { stopping: { rules: [{ name, when: condition, do: [{ stop: reason }] }] } }` |
| stop reason `'stopWhen condition met'` | the rule's own `stop` reason                                                                                                      |
| scape `"<model name> as a whole"`      | the scape's own name, the key in `scapes`                                                                                         |

The five examples gave the numbers they gave before (their tests pinned them).

## Not done

- Addresses that Studio wrote before the change hold the old rule settings (`schedule`,
  `order`, `sampling`); Studio drops them, so such a link starts with the model's own settings.
