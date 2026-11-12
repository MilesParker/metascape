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
  need 800) the simulation peaks around 1,060 households against at most 216 in the record,
  and never reaches zero. No calibrated values were found in the legacy sources. Either a port
  bug or the defaults are not the published ones; the published parameter settings would
  settle it.
- **Demographic PD wealth.** In the introductory `prisoners-dilemma` model, wealth grows very
  large in cooperator clusters; check against Epstein's model.

## Next work

- **UX polish** of Studio, the Rules tab and the chart customizer (functional, styling not yet
  reviewed). Use an Opus session as the minimum for this kind of UX work.
- **Browser pass over the ported models.** All build and run in tests, but most have not been
  looked at in Studio. Views and colours are unverified for many families.
- **Bundle size.** Studio's main chunk is about 870 kB (the build warns above 500 kB); split
  the model catalogue with dynamic imports.
- **Web Worker execution.** Simulations run on the main thread with a per-frame time budget.

## Engine gaps found while porting

Each was worked around locally in the family that needed it; move into the engine when a
second user appears.

- **Ascape-exact neighbourhood search:** Euclidean distance ranks with strict bounds and random
  choice within a rank (`brookings/civil-violence/vision.ts`, `ascape/bionland/lattice-space.ts`,
  `brookings/anasazi/valley.ts`, `brookings/sugarscape/ascape-space.ts`). The engine's
  `within`/`nearest` use Chebyshev or Manhattan rings.
- **Ascape diffusion** (mean of neighbours, two-phase); the engine's `diffusion()` shares
  quantity out instead (`ascape/bionland/lattice-model.ts`, `brookings/sugarscape/ascape-space.ts`).
- **Graphs with Ascape semantics:** ordered neighbour lists that allow repeats, clearing both
  directions (`amp/markets/markets.ts`); breadth-first search over a `Network`
  (`ascape/bionland/graph.ts`).
- **Per-rule visit order:** one scape cannot shuffle for some rules and keep creation order for
  others (`brookings/coordination-game/coordination-game.ts` adds a scheduling scape).
- **Initial rules run for agents added mid-run.** Several families moved start-up logic into
  `sim.setup` to avoid this; consider a scape option to run initial rules only at start.
- **Views:** a grid view cannot draw a network over the lattice (Sugarscape II-5); a continuous
  view takes one scape and cannot hide agents; there is no scrolling 1D history view (Norms) or
  rotating view (Retirement); grid views use the first occupant's shape.
- **Java-style random helpers** (`nextGaussian` with a spare value): `brookings/anasazi/java-random.ts`.

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
