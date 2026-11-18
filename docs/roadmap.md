# Roadmap and open questions

What is known to be unfinished, open for the owner to decide, or worth doing next. Keep this
current: remove items when they are done.

## Owner decisions still open

- **Name of the model format.** The declarative format lives in `@metascape/spec`; the name is
  provisional ("MetaABM" was rejected).
- **`NOTICE` copyright line.** It reads "Miles Parker and contributors"; Metascape LLC may be
  preferred.
- **"IMPORTANT README" in the Ascape models.** `org.ascape.models.brook/res/edu/IMPORTANT
README.txt` says the `edu` code "is not clearly licensed to Bios" (another project). It is not
  a licence notice, but what it refers to is unexplained. Quoted in
  `packages/models/src/brookings/anasazi/README.md`.
- **Artificial Anasazi calibration.** At the legacy defaults (harvest adjustment 1.0, nutrition
  need 800) the model peaks around 1,060 households against at most 216 in the record,
  and never reaches zero. No calibrated values were found in the legacy sources. Either a port
  bug or the defaults are not the published ones; the published parameter settings would
  settle it.
- **Demographic PD wealth.** In the introductory `prisoners-dilemma` model, wealth grows very
  large in cooperator clusters; check against Epstein's model.
- **Ported structure kept for faithful numbers.** Sugarscape's rule M, Boids and Schelling read
  their space directly. Giving them Ascape's structure would
  change agent ids or the order of random draws, so their numbers would no longer match the
  current ports. Keep the numbers, or restructure and accept new ones?

## Next work

- **Studio metadata, family by family.** The redesign (see `docs/design-brief.md`, as
  amended by `docs/design-changes.md`) renders everything from model metadata with
  fallbacks. Declared legends, readable series labels, time units, `live` parameters, rule
  descriptions, inspector field names and things to try exist for the introductory models
  and the brief's stress models; the other families show no legend, humanized identifiers
  and periods. A parameter may be marked `live` only where the model reads it afresh each period
  (the catalogue test checks it has an effect). Work through the ported families most used
  first (Sugarscape, Civil Violence, Anasazi), without changing model behaviour.
- **Interventions in the address.** A link holds the starting configuration; changes made
  during a run are marked on the charts but not replayed from the link.
- **Rewinding the world.** The charts share a cursor over the run so far; going back in the
  views needs engine snapshots.
- **Lab.** Experiments and sweeps, side-by-side runs and a model editor have a placeholder
  route in Studio.
- **Network layout.** `layout: 'force'` is still drawn as a circle.
- **Web Worker execution.** Models run on the main thread with a per-frame time budget.

## Engine gaps found while porting

Each was worked around locally in the family that needed it; move into the engine when a
second user appears.

- **Ascape-exact neighbourhood search:** done (2026-11-18). The engine's `LatticeRanks`
  (`space/lattice-ranks.ts`) holds Ascape's rank table and searches by it; Civil Violence,
  Bionland and Anasazi use it, each with its own order of offsets within a rank so their runs
  are unchanged (Sugarscape had no copy). A format model's `nearest` on a grid searches by rank
  too (`docs/codegen.md`).
- **Ascape diffusion** (mean of neighbours, two-phase); the engine's `diffusion()` shares
  quantity out instead (`ascape/bionland/lattice-model.ts`, `brookings/sugarscape/ascape-space.ts`).
- **Graphs with Ascape semantics:** breadth-first search over a `Graph`
  (`ascape/bionland/graph.ts`).
- **Views:** a grid view cannot draw a network over the lattice (Sugarscape II-5); a continuous
  view takes one scape and cannot hide agents; there is no rotating view (Retirement); grid views
  use the first occupant's shape. One-row lattices (Norms, Bionland's strips) are now drawn as
  a scrolling history by `@metascape/react`.
- **Java-style random helpers** (`nextGaussian` with a spare value): `brookings/anasazi/java-random.ts`.

## The model format (`@metascape/spec`)

The format is being redone from the MetaABM metamodel so that the AMP `.metaabm` models can be
translated into it directly and become the source of truth (owner direction, 2026-11-16). The
mapping and the review items (R1 to R25) are in `docs/metamodel-review.md`; the owner decided the
last open ones (D1 to D12) on 2026-11-17. The AMP models
in `packages/models/src/amp` are now their `.metaabm` files, translated and interpreted; the code
ports are gone, except SIR's.

- **Statistics of nested scapes.** The interpreter does not collect statistics of a nested
  scape's populations, so Epidemic (AMP): Regional, whose individuals live in its cities, has no
  chart.
- **Run specs** (R24). APar and ATest are ported (`packages/spec/src/runspec`), with the Escape
  `.apar` and `.atest` files translated; Studio offers the Epidemic models' run specs. Still to
  do: running a run test, or a sweep, from Studio (an experiment view); a run spec for
  `EpidemicPeriods.java` (100 cities, rare migration, stop period 3000), which has no `.apar`;
  and statistics of nested scapes, without which constraints on Regional's individuals are not
  recorded.
- **Gaps of the format, to fill when a model needs them** (D4). Add each only for a model that
  needs it, as a core library function where possible:
  - networks made by a generator (small-world and the like), and
  - removing one link of an agent (a disconnect removes every link), both for the small-world
    Epidemic;
  - moving by a heading and a speed in a continuous space, for Pursuit;
  - hiding an agent by its style, for Foragers' "Show foragers" parameter.

  The small-world Epidemic and Pursuit are left out of the format until then
  (`docs/metamodel-review.md`, Ambiguities).

- **System dynamics.** The SIR example uses AMP's separate system dynamics metamodel (`sd.ecore`:
  stocks, flows, auxiliary variables). Port it after the main metamodel (review item R10); until
  then SIR stays as code.

## Models people share

Owner direction, 2026-11-18: people define models only in the format, never in arbitrary
TypeScript. Models should be easy to trade, and to offer to a shared library by pull request; a
common metamodel is what makes that work. Coded models remain only as bundled, reviewed code, until
they are converted. What follows from it, still to design:

- **Fencing method acts.** Not yet decided. The options discussed: no methods in shared models, so a
  model that needs new behaviour proposes a core library function to Metascape itself, reviewed as
  code (D4); or methods written in a TypeScript subset that is parsed, type-checked against the
  method API only, restricted to an allowlist of syntax, and re-emitted by Metascape, so the author's
  text is never run. D2's switch stays for anything else.
- **Running loaded files.** A model file is data: the interpreter only reads it, and generated
  execution (`docs/codegen.md`) puts none of its text into code. So with models written only in the
  format, and no method bodies run from files, no sandbox is needed for safety. Optional hardening,
  not a prerequisite: a Web Worker in a sandboxed iframe with no origin of its own and no network
  would contain a bug in the generator, let Studio stop a model that runs away (an endless cascade
  of causes, a population that explodes), and keep the page responsive. It would also be the one
  place a Content-Security-Policy need allow `unsafe-eval`, if Studio ever sets one.
- **Reviewable files.** A pull request is only as good as its diff: a canonical serialization
  (stable key order and formatting), stable IDs, and small files (overlays for model chains, above).
- **Checks on a pull request:** the checker, a run of some periods, the model's run tests (ATest),
  and its provenance and licence present.
- **Authoring.** Hand-written JSON is slow and error-prone (the pilot generated its files with
  scripts), so sharing needs the model editor.

## Moving the coded models into the format

The owner wants every coded model (Ascape, Brookings, the introductory models) written as a format
model. Equivalence is statistical: deterministic per seed, with no reproduction of the ports' draws.
A pilot (2026-11-17, reports in `docs/format-pilot/`) wrote Civil Violence Model I (with Runs 1 to 5
as run specs), Sugarscape II-1 to II-3, and Emergence of Classes Model One (with Figures 2 and 3 as
run specs). All three are pure spec, with no method acts, and match their ports over many seeds. They
sit in the catalogue beside the coded models as "… (format)". The format gained `lineOfSight`,
`locationX` and `locationY`. Memory as agents nested in the bargainer works, so R3 (no arrays)
stands.

Open for the owner:

- **Building one model on another.** Sugarscape II-2 is 96% II-1, and II-3 is II-2 renamed. Without
  reuse, Sugarscape's 23 models and Bionland's 21 steps would be about 40,000 lines of JSON. The
  pilot recommends an overlay: a model names a base and holds what it adds, replaces (by path) or
  removes, merged before checking (`docs/format-pilot/sugarscape.md`). Steps that are only settings
  become run specs or catalogue aliases. The same idea applies to agent types (a `person` holding
  the placement and walk that Civil Violence's citizen and cop now each repeat). Owner,
  2026-11-18: both are resolved at load into a flat model, and a selection of a type does not find
  its subtypes, since for the science it must be plain when behaviour changes.
- **Documentation lives in the model** (owner, 2026-11-18): model files stay JSON, with no
  comments; documentation goes in the `description` of the element it documents (MetaABM's own
  field; no separate `notes` field), including rationale, citations and departures from the
  original.
  The `.metaabm` translation keeps every `description` (the files have no XML comments); the only
  text dropped is the boilerplate on the grid's dimensions array, which R3 removed. The format
  models written from coded ports do not yet carry the ports' explanations: of Civil Violence I's
  131 acts and Sugarscape II-1's 78, none has a description, and Classes Model One documents 5 of 66. Converting a coded model must carry the comments of the port and of the legacy Java into the
  model, and the three pilot models need it done after the fact.
- **When a format version replaces the coded one,** as the AMP ports were replaced.
- **Speed.** Format models run as generated JavaScript by default, with the same
  runs as the interpreter (`docs/codegen.md`). They are now about 2 to 4 times slower per period than
  the ports (Sugarscape II-1, Civil Violence I, Heatbugs), and 20 times for Classes, against 12 to
  160 times before. What remains is mostly the models' own search work: a `nearest` search by rings
  on a grid (Civil Violence), and counts kept instead of recounted memories (Classes).

Gaps found, to fill when a model needs them (D4):

- curation measures: ratios, means over a qualified subset, products and scaled series (Civil
  Violence's Measures Chart);
- a change of a parameter at a period, in a run spec (Civil Violence Runs 3 to 5 use inert
  parameters and a rule instead);
- `toInteger`, or integer results from `floor`, `ceil` and `rint`;
- an `other` term for picking another agent of one's own kind without a space (Classes uses
  `minimize` of `zero`);
- setting one state attribute from another with the same options;
- the checker warns about a query after a logic act even where it is meant (Sugarscape's "move only
  if the best cell is free");
- a root attribute changed by a `set` is not shown with the parameters in Studio;
- colouring cells by a value (Civil Violence's grievance view), and placing a nested scape in a
  continuous space at computed coordinates (Classes' simplex view);
- `fromMetaabm` (in `packages/models/src/amp/metaabm.ts`) compiles any format model; move it out
  of `amp/` under a neutral name.

Writing the JSON by hand is slow and error-prone: both Civil Violence and Sugarscape were written
by throwaway scripts that generated the files. This is a cost of the whole effort until a model
editor exists.

## Not ported, on purpose

- `edu.brooksantafe` Heatbugs from Ascape: its directory carries a GNU GPL notice. The AMP
  Heatbugs is ported instead.
- UI code (Swing views, customizers, 3D views) and file-export harnesses; batch harnesses became
  experiment designs where they had a model behind them. Each family README lists these.
