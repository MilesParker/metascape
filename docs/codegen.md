# Generated execution of format models

Status: 2026-11-18 (`nearest` by rank added the same day). `compileModel` turns a model's acts into JavaScript when the model is compiled
and runs that in place of the interpreter's closures. This is the default (owner's decision,
2026-11-18); `execution: 'interpreted'` runs the interpreter instead. Every format model of the catalogue
runs generated, with no act left to the interpreter, and gives the same run as the interpreter for
every seed tested, period by period. The code is in `packages/spec/src/metamodel/codegen`.

People will define models only in the format and trade them as files (`docs/roadmap.md`, "Models
people share"), so format models must run about as fast as code. AMP generated Java for the same
reason. Here the code is made in the page when the model loads, with no build step.

## What is generated

For each agent type, and each of its styles, one module (`Emitter.build`, a `new Function` of the
constants `K` and the helpers `H`), holding one function per root act: rules, schedules,
initialize, build, watch, derive and perform. `Behaviour.run`, which every rule, watch, cause and
derive goes through, calls the generated function where there is one; the engine rules made for
plain rules call it directly.

The generator does not have its own reading of the acts. It works from the interpreter's analysis
in `flows.ts` (the order flows run in, each select's region and exits, the gates and the acts after
them, the spatial terms of each exit) and writes out what the interpreter's closures would do with
it:

- **Frames become blocks.** The interpreter carries a chain of frames down a flow: each binds a
  selection to an agent and remembers the values of evaluates and queries worked out on it. In
  generated code a frame is a block: the agent it binds is a local variable (`x_neighbors$3`), and
  each remembered value a local variable of that block (`m_energyLeft$0`), declared unset. The
  interpreter's search up the chain for a binding or a remembered value becomes, at generation, the
  choice of the enclosing block's variable. The generator keeps, as it writes the code in the order
  it runs, which values are surely set and which may be, so that a value an evaluate has already
  given is just its variable, and one that may not be is tested first, as the interpreter's `recall`
  does.
- **Each act is written where the flow reaches it**, as the interpreter fires it once for each
  arrival. A flow that would write more than 5,000 acts is left to the interpreter.
- **Gates** (queries and logic acts outside a region) become `if` statements on the arrival's own
  block, with their results remembered as the interpreter remembers them.
- **Selections** become a loop over the candidates (from the interpreter's own `exitCandidates`),
  the exit's tests as one expression in the interpreter's order and with its short cuts, then the
  choice (`R.pick`, or the ties of `nearest`, `minimize` and `maximize`) and the exit's flow for
  each agent chosen. The nearest of a grid's cells is found by the interpreter's own search by
  rank (`nearestCells`, below), with the tests as a function of the candidate.
- **Calls of core functions** that are hot and simple (comparisons, arithmetic, Java's integer
  arithmetic, `random*`, `timeNow`, `java.lang.Math`) are written out by templates
  (`templates.ts`), keyed by function ID and used only when the function's implementation is the
  core library's own. Each template evaluates every argument once, in order, as the interpreter
  does before a call. Any other function, including one given in `CompileOptions.functions`, is
  called through the implementation the interpreter would call.
- **Commands** (move, leave, die, connect, replace, disconnect) and the spatial tests call the same
  functions the interpreter calls (`flows.ts`, through `helpers.ts`); `set` calls `RunState.write`,
  so watches run as before; reads of derived attributes go through `RunState.read`. Reads of other
  attributes go straight to the holder's values unless a derived value is being worked out (when
  reads must be recorded).
- **Method acts.** A method's implementation, a TypeScript function given to `compileModel`, is
  passed to the generated code as a constant and called. A method body held as text in the model
  stays under D2: it is compiled only if `allowMethodBodies` is set, exactly as for the interpreter,
  and the function made from it is passed as a constant. The body's text never goes into generated
  code.

The diffuse act stays the interpreter's rule (`interpreter.ts`), made faster for both modes.

### Fallback

A root act whose flow uses what the generator does not handle is left to the interpreter, alone;
the rest of the agent's acts are still generated. `generationReport(model)` lists those acts with
the reason, and the sources generated, by file. The generator leaves an act to the interpreter
when:

- a selection tests its candidates with a function that is not pure (a random function, a style
  function, or a function given in `CompileOptions.functions`). The interpreter remembers what it
  works out on each candidate's frame for the whole choice; the generator does not, which gives the
  same only for pure tests, so it does not try;
- a flow refers to an act, constant or function the model does not have (the interpreter fails
  there when it runs);
- a flow would write more than 5,000 acts.

No format model in the catalogue meets any of these. If the page does not allow code to be made
(`new Function` throws, as under a Content-Security-Policy without `unsafe-eval`), every act is
interpreted, and the report says why.

## Keeping model text out of code

Models come from other people's files. All source text is put together in one small module,
`codegen/emit.ts`, under these rules:

- **Code is a type.** Source text is a `Code`, made only by the `code` template tag, whose literal
  parts are the generator's own source, and by the functions of `emit.ts`. A plain string put into
  a `code` template throws; TypeScript rejects it before that.
- **IDs only in names, behind a prefix.** An ID from a model is part of an identifier only after
  `emit.ts` checks it against the format's ID pattern (`^[A-Za-z_][A-Za-z0-9_]*$`) again, whatever
  the schema has checked. It always follows a prefix of one lowercase letter and an underscore (`a_`
  for an attribute, `t_` an agent type, `r_` a root act, `x_` an agent bound by an act, `m_` a
  remembered value, and so on), so it cannot be a reserved word, `__proto__`, `constructor` or one
  of the generator's own names, which begin with a capital letter or `$` (`S`, `R`, `$Found3`).
  The parts of a path are joined with `$`, which no ID contains, so two paths never make one name.
- **Strings only as JSON literals** (`JSON.stringify`, with U+2028 and U+2029 escaped too), so a
  string reaches the program as the same string.
- **Numbers only if finite**, written by `String`; other numbers, and every other value the code
  needs (attribute and agent type records, functions, option lists), are passed in the constants
  array and declared by name (`const a_bug$energy = K[3];`).
- **Nothing from a model goes into a comment.** Labels, descriptions and other free text do not go
  into generated code at all.
- The generated functions are returned in a `Map` keyed by act ID, not an object literal, so an act
  named `__proto__` is an ordinary key.

The tests (`codegen/codegen.test.ts`) check that names refuse anything that is not an ID (quotes,
backticks, `*/`, `${…}`, line and paragraph separators, `.` and `$` in the wrong place) and accept
and prefix `__proto__` and `constructor`; that strings come back as the same string; that a raw
string cannot be put into code; that a model whose every label and description is hostile text
generates exactly the same sources as the plain model; that hostile literal strings set and compared
in a flow arrive as data and run the same as interpreted; that a model with `__proto__` and
`constructor` as IDs runs the same both ways; and that nothing the hostile text tries to set on the
global object is set.

### Reading the generated code

The code is meant to be read in a debugger. Names come from the model's IDs (`r_move$1`,
`a_citizen$jailTermsLeft`, `x_nearHome$5`), and each module ends with
`//# sourceURL=metascape/<model>/<agent path>.js`, so DevTools lists it as a file (styles as
`…/style1.js`). `generationReport(model).sources` gives the same text.

Agents keep their values in the slot array the interpreter, the statistics and methods share, read
by position (`H.readOwn(S, x, t_bug, a_bug$energy, 2)`). Classes with named fields per agent type
were considered, to show agents readably in the console; they would need a second representation
kept in step with the slot array for everything else that reads values, and reads by a constant
position are already cheap, so they are not done.

## Correctness

The whole test suite passes with either mode as the default.

The rule (owner, 2026-11-18): a model must be deterministic, run for run from its seed, in each
mode. The two modes need not give the same runs as each other. Identity is the test used below
because it was free while generation mirrored the interpreter; it is not a constraint. Where a
cheaper order of searching or drawing makes generated runs differ, the comparison becomes
statistical, as the format pilot's comparisons with the coded ports were.

What matters for speed is avoiding differences of order (O(n) where O(1) would do, a scan of every
cell where a search outward would do), not constant factors against hand-written code.

The oracle is identity: generated and interpreted runs of the same model and seed give the same
statistics and the same state of every agent (values, place, whether it lives, links), period by
period (`traceRun` in `metamodel/trace.ts`). Because every format model is then a test, the tests
run every format model of the catalogue in both modes (`packages/models/src/format-execution.test.ts`:
the eleven AMP models with acts, Civil Violence I, Sugarscape II-1 to II-3, Classes Model One; two
seeds, 25 periods each), and the examples Life, Schelling, Foragers and StupidModel 1
(`codegen.test.ts`). Each also checks that no act was left to the interpreter.

Identity is reachable because generation mirrors the interpreter: the same analysis, the same
order of acts, the same lazy evaluation and remembering of values, the same order of tests and
random draws, and the same functions for searches and commands. Where the generator does something
cheaper (not remembering a value on a candidate's frame), it does so only where the result cannot
differ, and otherwise leaves the act to the interpreter.

While this was built, a fingerprint of every format model's run under the original interpreter (20
models, two seeds, 40 periods) was recorded before any change, and both modes were checked against
it after each change, including the interpreter changes below: all identical.

## The profile

The interpreter, before this work, on the four models (Node 24, `node --cpu-prof`, 200 periods):

- **Civil Violence I** (40 × 40, 1,120 citizens, 64 cops): about 60% in choosing (`choose` and its
  test closures), 10% making a frame for every candidate (`Env.frameFor`), 17% reading attributes
  (frame search, `holderFor`, `RunState.read`), 6% looking up remembered values in per-frame maps,
  8% derived values, 4% statistics.
- **Sugarscape II-1**: 53% in `Array2D.rays`, worked out again for every candidate cell to test
  `lineOfSight` on cells the search had just found by `rays`; the rest frames and closures.
- **Emergence of Classes Model One**: 21% looking up remembered values up long chains of frames
  (`Frame.own`, `recall`), 10% candidate frames, 9% attribute reads, 8% calls through the library
  (an argument array and a context object per call), the rest closures. Each choice recounts every
  memory, as the model says.
- **Heatbugs (AMP)**: 42% the diffusion (reads through `holderFor` and `RunState.read`, a `Map`
  of new values), 21% the watch on heat that every diffused value sets off, 17% gates.

So the costs were frames and their maps, closures per act and per test, calls through the library,
and a few searches done more often than needed. Generation removes the first three; the searches
are shared code, fixed for both modes.

## Changes to the interpreter, for both modes

Each gives the same run as before (checked against the fingerprint):

- A spatial filter that the search already ensures is not tested again for each candidate on a
  grid: `neighbor`, `within`, `here` and `lineOfSight` when the search is by that term (Sugarscape
  II-1: 5.9 to 1.9 ms per period interpreted).
- `Array2D.rays` is worked out once per cell and range (engine), as `neighbors` already was; a
  grid keeps the cells within each radius of each cell, up to a million kept.
- `location2D` with coordinates that do not depend on the candidate finds its cell of a grid
  directly instead of testing every cell (Civil Violence's release).
- `nearest` among a grid's cells, chosen from the whole population, searches outward from the
  origin by rank (`searchesRanks`, `nearestCells` in `flows.ts`) instead of testing every cell:
  Civil Violence's released citizen, put back near the site of arrest, tested all 1,600 sites.
  The ranks are the engine's `LatticeRanks`, made once per grid by its own metric and reaching
  every cell once (on a torus, the shortest way round), so the first rank with a match holds
  exactly the cells a scan finds nearest. Those are then put in the population's order before
  the draw, as the scan had them, so the draw is the same and **runs do not change**. Ascape
  chooses in rank order; that would have changed every run with ties for nothing, since runs
  need not match Ascape's numbers. Checked against a fingerprint of every format model of the
  catalogue (interpreted, three seeds, 60 periods; Civil Violence makes about 1,600 such
  searches in a run): identical with and without the search. One case does differ: a test that
  draws or changes something (a random function) is now tried only on cells as far as the
  nearest match, so a model with one would run differently, still deterministically. No
  catalogue model has one, and generation leaves such a selection to the interpreter.
- A population with one instance is read as it is, not copied.
- Setting an attribute that no watch watches does not look for watches.
- The root scape's attributes (the parameters) are read from the root scape instance, rather than
  by walking up the scapes.
- The diffusion reads the cells' values directly and keeps new values on the cells.

## Measurements

Milliseconds per period (`npx tsx packages/models/scripts/bench-format.ts 200 3`: 200 periods after
10 of warm-up, mean of three seeds, default parameters, Node 24 on the owner's laptop). "Before" is
the interpreter as it was at the start of this work, measured the same way with 50 periods and two
seeds.

| model                         | before | interpreted | generated | coded | before / coded | generated / coded |
| ----------------------------- | -----: | ----------: | --------: | ----: | -------------: | ----------------: |
| Civil Violence I              |  15.55 |        7.44 |      2.60 |  0.92 |             17 |               2.8 |
| Sugarscape II-1               |   5.86 |        1.71 |      0.77 |  0.41 |             14 |               1.9 |
| Emergence of Classes, Model 1 |   6.71 |        6.44 |      0.89 | 0.044 |            150 |                20 |
| Heatbugs (AMP)                |   6.99 |        3.53 |      2.22 |  0.59 |             12 |               3.8 |

The coded Heatbugs is Ascape's, not a port of AMP's model, so its ratio is only a rough guide.
Classes' coded time is small enough to be noisy (0.04 to 0.07 ms between runs).

Measured again after the search by rank for `nearest` (2026-11-18): Civil Violence I generated
went from 3.52 to 2.60 ms per period, interpreted from 8.57 to 7.44. The other three do not use
`nearest`; their differences from the first measurement are noise between runs.

Against the start, the format models now run 6.0 (Civil Violence), 7.6 (Sugarscape), 7.6
(Classes) and 3.2 (Heatbugs) times faster. Generated code alone is 1.6 to 7 times faster than the
interpreter as it is now. The target, the coded ports' speed, is not reached: generated runs are
about 2 to 4 times slower than the ports, and 20 times for Classes. In all four what remains is
mostly the work the model itself asks for (see What remains), which the ports do with cleverer
data structures than the format can state: Classes' port keeps counts where the model recounts its
memories.

## Content-Security-Policy

Studio sets no Content-Security-Policy today. A policy for it would need `script-src
'unsafe-eval'` for generated execution, since `new Function` is evaluation; without it the models
still run, interpreted, at the speeds above. The better course is the sandboxed Web Worker the
roadmap proposes for running loaded files ("Models people share"): the worker, in an iframe with
no origin of its own and no network, would be the only place with `unsafe-eval`, and the page
itself could forbid it.

## What remains

- **The searches the models ask for.** What is left between generated and coded is mostly the
  models' own search work, the same in both modes: each Classes choice recounts every memory (the
  pilot report suggests per-bargainer counts); Heatbugs diffuses over every cell. In Civil
  Violence, with the release now searched by rank, a profile of the generated run puts most of
  what remains in the walk and vision selections' candidate lists: `exitCandidates` and the
  closures it makes on every call take about a quarter of the run under `tsx` (whose `__name`
  wrapping of closures is part of that).
- **The rule loop.** Each agent's rule is still a call from the engine's scape iteration into the
  generated function; generating the loop over a scape's members as well would save a call and a
  `Map` lookup per agent.
- **Diffusion** is the interpreter's rule, not generated.
