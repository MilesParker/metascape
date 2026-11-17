# Roadmap and open questions

What is known to be unfinished, open for the owner to decide, or worth doing next. Keep this
current: remove items when they are done.

## Owner decisions still open

- **Name of the model format.** The declarative format lives in `@metascape/spec`; the name is
  provisional ("MetaABM" was rejected).
- **Model format review.** `docs/metamodel-review.md` maps the MetaABM metamodel onto the new
  format and lists review items R1 to R25.
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

- **Ascape-exact neighbourhood search:** Euclidean distance ranks with strict bounds and random
  choice within a rank (`brookings/civil-violence/vision.ts`, `ascape/bionland/lattice-space.ts`,
  `brookings/anasazi/valley.ts`, `brookings/sugarscape/ascape-space.ts`). The engine's
  `findWithin`/`findNearest` on a lattice use Chebyshev or Manhattan rings.
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
mapping and the open review items (R1 to R25) are in `docs/metamodel-review.md`. The AMP models
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
- **Stopping on a condition** (R24, _proposed_): a run spec's `stopWhen`, shaped like an ATest
  constraint. Schelling and Foragers stop again. Waiting for the owner's review.
- **Examples left out of the format.** The small-world Epidemic needs a network made by a
  generator and a way to drop one link; Pursuit needs movement by a heading and a speed in a
  continuous space. Neither is in the format (`docs/metamodel-review.md`, Ambiguities).

- **System dynamics.** The SIR example uses AMP's separate system dynamics metamodel (`sd.ecore`:
  stocks, flows, auxiliary variables). Port it after the main metamodel (review item R10); until
  then SIR stays as code.

## Not ported, on purpose

- `edu.brooksantafe` Heatbugs from Ascape: its directory carries a GNU GPL notice. The AMP
  Heatbugs is ported instead.
- UI code (Swing views, customizers, 3D views) and file-export harnesses; batch harnesses became
  experiment designs where they had a model behind them. Each family README lists these.
