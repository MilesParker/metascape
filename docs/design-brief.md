# Metascape Studio: UX redesign brief

For the session that will redesign Studio end to end. This gives direction and the reasons
behind it; the detailed design is yours. Nothing in the current design is protected. The owner
does not like it, and wants something contemporary, with room for creative solutions.

Written from a pass over the running app (November 2026) across about a dozen models, chosen
to cover every view type. Narrow-window and light-theme behaviour were not checked.

## 1. What Studio is for

Studio is where people meet agent-based models: pick one, run it, watch its views and charts,
and change its parameters, its rules and the order the rules run in, while it runs. The last
part is the point. It is what Ascape offered and what its users expect as a baseline.

Four kinds of people use it, and one surface has to serve them all:

- **The curious**, who know little about the approach and should be watching something
  surprising within seconds, then be tempted to poke at it.
- **Students**, who are working out why a model behaves as it does.
- **Teachers**, who demonstrate on a projector and hand out a link to an exact configuration.
- **Researchers and modellers**, who know the models, want every control within reach, and
  care about reproducibility and getting data out.

The owner's test: welcoming and fun for the first group without becoming trivial or hiding
behaviour, and fast and powerful for the last. Those pull against each other. Resolve it with
progressive disclosure on one surface, not with a beginner mode.

## 2. What exists

`apps/studio` is about 100 lines: two native dropdowns (family, model) over `ModelRunner` from
`packages/react`, which holds everything else (run controls, parameter form, Rules tab, canvas
views, uPlot charts, chart customizer, inspector). The catalogue is 132 models in 26 families
(`packages/models`, plus five data-defined models from `packages/spec`). Run `npm run dev` in
the repository root.

Keep every capability: start, pause, step, restart, speed, seed; parameter editing; per-scape
rule toggling and reordering with execution order, visit order and complete tour or repeated
draw; chart series selection, chart type, added charts; picking an agent or cell; provenance.
Provenance must stay easy to find on every ported model. It is a licensing commitment, not
decoration.

## 3. What hurts most

In rough order of damage:

1. **There is no front door.** The app opens on Game of Life with two dropdowns for 132
   models. No search, no preview, no sense of what is worth trying. Tutorial sequences
   (Bionland's 21 steps, the Coordination Game, Sugarscape by chapter) are flat lists.
2. **The simulation is not the hero.** Every view and chart gets an equal tile, so on a
   1700 px screen the world is about 330 px square, the same as a chart of one series. Views
   cannot zoom, pan or fill the screen. Odd shapes break: Norms draws a ring as a strip one
   pixel high in an empty square; Emergence of Classes clips its agents in a corner.
3. **It is a scrolling document, not a tool.** Artificial Anasazi has 24 parameters in one
   ungrouped column, the page is 2,600 px tall, the run controls scroll away, and "Apply and
   restart" sits at the bottom. Opening a chart customizer reflows the whole grid. The
   citation is a block of italics above the controls.
4. **Changing things is hidden or punitive.** Every parameter needs a restart, including
   ones such as Boids' steering weights that people want to drag while watching. Rules, the
   signature feature, are behind a tab and then a scape dropdown, in unexplained terms
   ("Repeated draw"), reordered with arrow buttons. Nothing shows what differs from the
   defaults, and nothing connects a change to its effect.
5. **Watching is passive and unexplained.** No hover, no mark on the selected agent, no
   colour legend (Anasazi's map is uninterpretable without one). The inspector lists raw
   fields (`on`, `next`). Chart series carry identifiers ("Count strategy0",
   "retiredShareOfEligible"), black series vanish on the dark theme, axis labels clip, and
   the x axis is always ticks even where a tick is a year. View backgrounds are hard-coded
   white or grey inside a dark shell.
6. **Runs end without saying why.** The network epidemic stops at tick 34 with "stopped" and
   a disabled Start. There are no keyboard shortcuts, no run-to-tick, and the seed appears
   twice.
7. **Nothing persists or travels.** The address holds only the model, and back and forward
   do nothing. Parameters, rule changes and chart choices die on reload. No export of data or
   images, though the engine can write CSV and run experiments.

## 4. Principles

1. **The world is the hero.** The spatial view gets the most space and the best pixels.
   Everything else is arranged around it and can get out of its way.
2. **Play first, explain in place.** A newcomer reaches a running model in one action.
   Explanation sits on the thing it explains (a rule, a colour, a term), never in a wall of
   text ahead of the model.
3. **One surface, two speeds.** No simple and advanced modes. The same controls serve
   everyone; depth is one step away, and experts get there faster by keyboard and command
   palette. Keep the real vocabulary (scape, rule, visit order) and teach it in passing.
4. **Show the mechanism.** A model is its rules and their schedule. Present that as something
   readable and manipulable, not as a settings form. Be straight about what a port does,
   quirks included.
5. **Every change is immediate, visible and reversible.** Apply live wherever the engine
   allows, say plainly when a restart is needed, mark what differs from the defaults, and
   offer a reset at every level.
6. **Manipulate directly.** Hover, click and drag in the world; scrub time; drag rules;
   brush charts. Forms are the fallback.
7. **Every state is a link.** The engine is deterministic, so model, parameters, seed, rule
   settings and layout in a URL reproduce a run exactly. Make sharing a first-class act.
8. **Model-driven, never per-model.** Everything renders from model metadata, with sensible
   fallbacks when metadata is missing. Colour belongs to the data; the shell stays calm,
   dense and neutral in both themes.

## 5. Structural changes

**Two places now, a third later.** A _Library_ for finding models and a _Workbench_ for
running one, each with a real route. Leave an obvious slot for a _Lab_ (experiments and
comparing runs) without building it.

**Library.** A searchable gallery in place of the dropdowns: cards with a live or
pre-rendered frame of the model, a one-line summary, and filters by collection, kind of space
and topic. Treat a family as a path where it is one (tutorial steps, book chapters), with
previous and next carried into the Workbench. Offer a short curated way in for newcomers. A
command palette reaches any model from anywhere.

**Workbench.** An application shell that fits the viewport and does not page-scroll:

- A **stage** holding the spatial view or views, as large as possible, with zoom, pan,
  full-screen, a legend, hover read-outs and a visible selection. Give each view the shape its
  space needs. Models with no spatial view (Markets) promote their charts to the stage.
- A **transport** fixed to the stage, in the manner of a media player: play, step, restart,
  speed up to unthrottled, time in the model's own unit, seed, and a clear statement when and
  why a run has ended.
- A **timeline** under it. Scrubbing moves a cursor shared by every chart. Each intervention
  (a parameter moved, a rule switched off) leaves a mark on it, so cause and effect line up.
  Rewinding the world itself needs engine support; design for it, do not block on it.
- A **controls rail** for Parameters, Rules and About, collapsible and resizable. The
  inspector appears where the selection is, and can be pinned.
- A **chart dock**, resizable, with configuration in popovers so nothing reflows.

Use resizable panes with a few named arrangements (watch, analyse, present) in preference to
free-form docking windows. Presentation mode matters for teachers.

**Parameters.** Group them, let long lists be filtered, show the default on each control,
mark and reset what has changed, and treat min and max pairs as ranges. Separate parameters
that can change live from those that shape the world at build time; collect the latter into
one pending "restart to apply" action beside the transport. The engine freezes parameters
today, so live change is engine work (section 7).

**Rules.** Show each scape's schedule as an ordered, draggable sequence that reads as a
sentence about what happens each tick, with the execution options stated in plain words
alongside the proper terms. All scapes visible together, not behind a dropdown.

**Invitations to explore.** Let a model carry a few "things to try" (switch off Metabolism,
set vision to 1), each applying its change in one click. After a restart, keep the previous
run's series as a ghost in the charts so the effect of a change is visible. These two serve
newcomers and experts alike and cost little.

**State.** Put the full configuration in the URL, handle back and forward, and remember
layout and chart choices per model locally. Add export of the current view as an image and of
recorded series as CSV.

## 6. Technology

Stay on React 19, Vite and TypeScript. Recommended additions:

- **Tailwind CSS 4 with owned components in the shadcn/ui pattern over headless primitives**
  (Radix or Base UI). The owner knows Material UI best, and it was considered. It is not
  recommended here: its components are sized and styled for forms-and-pages applications,
  and a dense, canvas-centred tool would spend its effort overriding them and still read as
  Material. Owned components on CSS-variable tokens give full control of density and look,
  and canvases and charts can read the same tokens. If the owner prefers a packaged library,
  use Mantine before MUI.
- **TanStack Router** for typed, validated search parameters, which is how state gets into
  the URL. **Zustand** for workbench state.
- **react-resizable-panels** for layout, **dnd-kit** for rule ordering (it is
  keyboard-accessible), **cmdk** for the command palette, **lucide-react** for icons,
  **Motion** used sparingly and honouring reduced-motion.
- **Keep uPlot** for time series; wrap it for theming and the shared cursor. **Keep Canvas
  2D** for views, leaving room for a WebGL renderer behind the view registry.
- A proper type scale with tabular numerals for every changing number; self-host the fonts.

## 7. Extensibility

- **Layering.** `@metascape/engine` stays headless. Make `@metascape/react` the embeddable
  layer: views, charts, hooks and headless controllers for parameters, rules and charts, with
  a minimal default-styled player and no dependency on Tailwind. Studio owns the rich shell.
  A teacher should be able to embed a model in a course page from the library alone.
- **Registries in place of switches.** View renderers by spec type (today a hard-coded
  `switch`), parameter editors by parameter type, workbench panels, inspector formatters, and
  one command list feeding both palette and shortcuts. The roadmap already wants new views
  (a network over a lattice, a scrolling 1D history); compose views from layers.
- **Additive, optional metadata**, each with a fallback so all 132 models keep working
  unedited: parameter `group`, `unit`, `step` and `live`; series labels and units; a view's
  legend and primary role; a time unit; model summary, tags and explorations; rule
  descriptions; inspector field labels.
- **A catalogue manifest.** The Library needs every model's metadata without loading every
  model's code. Split the two and load models on demand; this also fixes the 870 kB chunk
  noted in the roadmap.
- **Do not assume the simulation shares a thread with the UI.** Worker execution is on the
  roadmap. Views and the inspector call into live agents today; keep that behind an interface
  that could later read snapshots.

## 8. Priorities

1. **Foundation.** Shell, routing, tokens and both themes; the Library with search; the
   stage-first Workbench with fixed transport and no page scroll; keyboard shortcuts.
2. **Core interaction.** Parameters, the rules sequence, the chart dock with a shared cursor
   and readable labels, hover, selection, inspector, legends, end-of-run messaging, state in
   the URL.
3. **Depth and delight.** Timeline with intervention marks, ghost runs, things to try,
   family paths, presentation mode, export, command palette.
4. **Design for, do not build.** Experiments and sweeps, side-by-side runs, rewinding the
   world, a model editor, worker execution.

Finish each level across the whole catalogue before starting the next. A polished Sugarscape
beside a broken Norms is a failure.

## 9. Constraints and checking

- Engine changes must be additive and optional. Do not alter model behaviour: ports are
  faithful on purpose, and runs are deterministic by seed.
- Keep the accessibility already present (labelled controls, keyboard tab patterns, reduced
  motion) and extend it to everything new. Laptop and larger is the target; tablets must
  work; a phone need only browse, run and watch.
- `npm run check` must pass. Existing component tests will need rewriting; keep the coverage.
- Check in the browser, not only in tests, against models that stress the layout: Game of
  Life (one view, one chart), Sugarscape IV-a (six panels, five rules), Artificial Anasazi
  (24 parameters, two maps, years, a run that ends), Norms (1D), Emergence of Classes
  (simplex), the small-world epidemic (network, ends early), Markets (charts only), Epidemic
  AMP (tall lattice, six states), Bionland (a 21-step path), Retirement (wide strip), Boids
  (continuous space).
- Read `docs/roadmap.md` first; it lists view and engine gaps that this work will run into.
