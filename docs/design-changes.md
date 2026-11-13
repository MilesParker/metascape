# Studio redesign: changes after review

For the session that built the redesign from `docs/design-brief.md`. The structure is right
and stays: Library, Workbench, live parameters, rule editing, intervention marks, previous-run
ghost, end-of-run reason, the engine metadata, the catalogue manifest. This pass is mostly
removal.

Where this document and the brief disagree, this document wins. These brief items are
withdrawn: named arrangements (watch, analyse), a schedule that "reads as a sentence", an
inspector that "appears where the selection is", and a separate timeline row.

Items marked **(owner)** came from the owner's own review and are not optional. The rest are
the reviewer's; follow them unless you find a concrete reason not to, and say so if you do.

## What went wrong

The brief named features as examples and each was built as a control. The result is fiddly:
several ways to do the same thing, buttons for what a drag already does, power-user tools in
the main chrome, and interface text written as friendly prose.

## Rules for this pass

1. **Remove before adding.** The number of visible controls must go down on every screen.
2. **No control for what the user can do directly.** If dragging, scrolling or clicking the
   thing itself does it, there is no button for it.
3. **One way to do each thing,** plus its keyboard shortcut. Not three.
4. **Feedback appears where the user is looking** when they act, and says what changed.
5. **Plain labels in the field's vocabulary.** Nouns and verbs. No sentences, slogans, hooks
   or coaching. Ascape's terms are the reference: execution order, visit order, scape, rule.
6. **An icon only where its meaning is conventional** (play, pause, step, restart, close,
   download). Otherwise use a word.
7. **Do not read this list literally where that would add clutter.** If a need here can be met
   without a new control, do that.

## Top bar

Now about fifteen controls. Target: home link, model title, one export menu, present, theme.

- **(owner) Remove Watch and Analyse.** They only set the chart area to 30% or 58% of the
  height. The divider does that; remember where the user left it.
- Keep **Present** as a single toggle. It hides the chrome, which a drag cannot.
- **(owner) Remove the Commands and Keyboard buttons.** Shortcuts and the palette keep
  working; tooltips already show the keys.
- **(owner) Remove the Provenance chip.** It only opens the About tab.
- **(owner) One way to move between models.** Today there are four: the ‹ 3/8 › arrows, the
  family link, the variants list in About, and Library. Make the model title a menu of its
  family's models (numbered where the family is a sequence, each with its one-line summary),
  ending in a link to the Library. Remove the arrows, the separate family link and the
  variants list in About.
- **One link home.** The logo and "Library" both go there; make them one.
- Remove **Lab "soon"** from the navigation. The route can stay.
- Merge **Share** and **Export** into one menu: copy link, image, data.

## Side panel

- **(owner) A collapsed panel must show how to reopen it.** Leave a visible strip at the edge
  that reopens on click. The divider can do the collapsing; the icon button is not needed.
- **About:** keep the description, tags, things to try and provenance. The provenance detail
  is good as it is; title it "Provenance". Remove the variants list (see above).
- Put **About first** and open it on a first visit, since it says what the model is and what
  to try. Afterwards open whichever tab the user last chose.
- Reset the panel's scroll position when the model changes.

## Rules tab

- **(owner) Delete the sentence** ("Each tick, every agent, once, in a fresh random order,
  runs these rules") and the note above it.
- Show the settings that are already there, as labelled controls in Ascape's terms: Execution
  order (By agent, By rule), Visit order (Shuffled, Sequential), Agents per step, Complete
  tour or Repeated draw. When collapsed, summarise them as terse labels, for example
  "By agent · Shuffled · Complete tour".
- Move each control's explanatory line into a tooltip.
- Call cells cells. "Every agent" is wrong for a lattice scape.
- After a reorder, show which rules moved, not only "changed".

## Things to try

- **(owner) Show what it changed.** Today it changes parameters and rules in tabs the user is
  not looking at and shows a toast. Each card must list its changes before it is applied
  ("Vision max 6 → 1", "Growback off"), show that it is applied, and offer undo.
- Remove the pill over the world. It covers the view and vanishes on play; About is enough.

## Stage

- **Give the world the largest square the window allows.** Today a 410 px view sits in a
  1,100 px wide area with black either side, and the charts are squeezed underneath at about
  70 px of plot height. In a landscape window put the charts beside the world; put them
  beneath only when the window is narrow. Sizes stay draggable and remembered.
- **Nothing covers the world by default.** Move the legend beside the view, into the space
  the letterboxing leaves. Anasazi currently opens with legends over half of both maps. With
  the legend beside the view its toggle button can go.
- **(owner) Selection marker.** A circle on the centre of a square cell reads as a cursor.
  Outline the selected cell; ring only agents, and follow them.
- **Inspector.** It opens over the neighbourhood of the thing selected and is clipped at the
  edge. Give it a fixed place off the world (the side panel is the obvious one) and drop the
  pin button.
- **View toolbar.** Remove zoom in and zoom out (scroll and pinch do it). Show "Fit" only
  while zoomed. Remove the per-view image button; the export menu has it. Keep the
  single-view toggle where a model has more than one view.
- **End of run.** Keep the reason and the restart action, but in the run controls, not over
  the world.
- **Emergence of Classes** is still a white square with agents clipped into a corner. Draw
  the simplex and fit it. View backgrounds should come from the theme unless the model's
  colours depend on a particular one.
- Check by hand that the hover read-out follows the pointer. It was seen once in the top-left
  corner, clipped; that may have been a testing artefact.

## Run controls

- Remove the **dice button**; "New seed" is already in the seed menu.
- **Run to a tick** uses a fast-forward icon that reads as "faster". Move it behind the tick
  read-out (click the number to enter a target).
- Remove the **Ready / Running chip**; the play button already shows it. Use that spot for
  the end-of-run reason.
- **Remove the timeline row.** While running it is a bar that is always full. The intervention
  marks and the shared cursor already live on the charts; label the marks there.
- **Space** must play and pause except in a text field or on a control reached with the
  keyboard. Today it re-presses whatever button was last clicked.

## Charts

- **(owner) The series chooser is not "settings".** Replace the sliders icon with a word, and
  put that chart's CSV download in the same menu, so each chart has one control.
- Show the tick once, in the run controls, not in every chart legend. Legends show values.
- Match the histogram's axis text to the other charts.
- Drop the count beside "Charts".

## Parameters

- **Make it compact.** A parameter takes about 95 px with its description always shown, so
  six fit on screen. Show the description on hover or focus.
- **(owner) Merged ranges repeat their text** ("Lowest vision. Highest vision."; Markets
  prints the same sentence twice). One label and one description per range.
- Number boxes truncate large values (100000 shows as "10000("). Size them to fit.
- Drop the lightning icon; the "Live" heading already says it.
- Show the filter box only on long lists.

## Library

- **(owner) The grouping feels arbitrary.** It follows where the code came from, which is
  provenance, not how anyone browses. Show one grid of family cards (picture, name, summary,
  number of models, source as a small label), introductory models first. A card opens the
  family's first model; the model-title menu then chooses the variant. This also removes the
  sideways strips and the rows of near-identical thumbnails.
- Remove the separate "Start here" row; it repeats the introductory models beneath it.
- Remove the Space, Collection and Topic filters. For about thirty cards, search over names,
  topics, authors and source is enough. A tag in About becomes a search.
- Plain heading and description. No slogan, no hooks on cards; use the model's summary.

## Text

One pass over every label, tooltip, toast and heading, applying rule 5. Examples to replace:
"Agent-based models, ready to run.", "Each of these shows something surprising within
seconds.", "Boom, bust, boom", "Press play, or pick one of 2 things to try", "Changes apply at
once, and stay for restarts.", "Link copied: it reproduces this run", "Where it comes from",
"Show it all", "Picture of the stage". Do not show internal names (stage, dock, rail,
arrangement) to users. Keep a toast only where an action has no visible effect.

## Then, separately: coverage across the catalogue

Not part of the clean-up, and not to hold it up. The redesign's best behaviour reaches few
models: live parameters are declared in 3 model files, parameter groups in 2, things to try
in 8, legends in 15. Every ported model still applies parameters only on restart, which is
below what Ascape did. Work through the ported families, most used first (Sugarscape, Civil
Violence, Anasazi): mark a parameter live only where the model reads it afresh each tick,
add groups to long lists, and add legends. Model behaviour must not change.

## Checking

- Count the visible controls on the Workbench before and after, and report both.
- Look at it in a browser against the brief's stress models, in both themes, and at a narrow
  width. Narrow layouts and dragging rules with the mouse were not confirmed in review.
- `npm run check` must pass.
