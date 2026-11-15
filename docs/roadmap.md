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

- **Ascape-exact neighbourhood search:** Euclidean distance ranks with strict bounds and random
  choice within a rank (`brookings/civil-violence/vision.ts`, `ascape/bionland/lattice-space.ts`,
  `brookings/anasazi/valley.ts`, `brookings/sugarscape/ascape-space.ts`). The engine's
  `findWithin`/`findNearest` on a lattice use Chebyshev or Manhattan rings.
- **Ascape diffusion** (mean of neighbours, two-phase); the engine's `diffusion()` shares
  quantity out instead (`ascape/bionland/lattice-model.ts`, `brookings/sugarscape/ascape-space.ts`).
- **Graphs with Ascape semantics:** ordered neighbour lists that allow repeats, clearing both
  directions (`amp/markets/markets.ts`); breadth-first search over a `Graph`
  (`ascape/bionland/graph.ts`).
- **Per-rule random order with one tour.** Rules now say whether they need a random order
  (`randomExecution`), but a scape draws one tour per iteration for all its rules, where Ascape
  reshuffles for each random rule when executing by rule. The coordination game keeps its own
  scheduling scape for that (`brookings/coordination-game/coordination-game.ts`).
- **Initial rules run for agents added mid-run.** Several families put start-up logic in an
  initial rule of a scape with a `Singleton` space to avoid this; consider a scape option to run
  initial rules only at start.
- **Views:** a grid view cannot draw a network over the lattice (Sugarscape II-5); a continuous
  view takes one scape and cannot hide agents; there is no rotating view (Retirement); grid views
  use the first occupant's shape. One-row lattices (Norms, Bionland's strips) are now drawn as
  a scrolling history by `@metascape/react`.
- **Java-style random helpers** (`nextGaussian` with a spare value): `brookings/anasazi/java-random.ts`.

## After the restructure to Ascape's architecture

The engine now follows the three abstractions of Parker (2001); see `docs/architecture.md`. Every
model gives the numbers it gave before, checked run by run against the old engine.

- **End-of-period work after statistics.** Civil Violence and Retirement adjust state once each
  period's statistics are collected, as their legacy models did in `scapeIterated`; they use a
  root scape listener for it. A rule cannot run at that moment.
- **Ported structure kept for faithful numbers.** Regional epidemic cities are agents beside
  their map and people scapes rather than scapes standing on the regional map, and Sugarscape's
  rule M, Boids and Schelling read their space directly, because changing either would change
  agent ids or the order of random draws.
- **Studio counts rules of the model as a whole** (stopping, set-up) in a model's rule count and
  lists their scapes in the rules panel.

## Gaps in the model format (`@metascape/spec`)

Found by assessing the AMP models against `packages/spec/src/schema.ts`:

- two-phase (execute then update) rules, needed for diffusion such as Heatbugs;
- an agent in more than one space at once (a grid and a network);
- moving toward a target on a grid, and rounded-Euclidean grid ranges;
- agents that own their own spaces and scapes, and moving agents between scapes;
- clearing all links of an agent;
- an explicit "cell is free" test; whether `create` can read the parent's attributes.

## Not ported, on purpose

- `edu.brooksantafe` Heatbugs from Ascape: its directory carries a GNU GPL notice. The AMP
  Heatbugs is ported instead.
- UI code (Swing views, customizers, 3D views) and file-export harnesses; batch harnesses became
  experiment designs where they had a model behind them. Each family README lists these.
