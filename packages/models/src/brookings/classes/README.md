# Emergence of Classes

Bargaining model of Axtell, Epstein and Young: agents divide a pie by demanding a low, medium or high share, and demand what would have paid best against their memory of past opponents. Conventions emerge and persist. Ported from Ascape 5.6.1 (`edu.brook.classes`), BSD licensed, copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others. This port is EPL-2.0.

Citation: Axtell, R. L., Epstein, J. M., & Young, H. P. (2001). The emergence of classes in a multi-agent bargaining model. In S. N. Durlauf & H. P. Young (Eds.), Social Dynamics. MIT Press. (The legacy About text also names CSED Working Paper #9.) The Java version was implemented by Miles Parker from Robert Axtell's Pascal original.

| legacy class          | new model or shared file                  | status                  |
| --------------------- | ----------------------------------------- | ----------------------- |
| Bargainer             | `bargaining.ts` (`Bargainer`)             | folded into shared code |
| BargainerTagged       | `bargaining.ts` (`BargainerTagged`)       | folded into shared code |
| PeytonBargainer       | `bargaining.ts` (`PeytonBargainer`)       | folded into shared code |
| Strategy              | `bargaining.ts` (`LOW`, `MEDIUM`, `HIGH`) | folded into shared code |
| BargainingModelBase   | `bargaining.ts` (`bargainingModel`)       | folded into shared code |
| BargainingModelOne    | Emergence of Classes: Model One           | ported                  |
| BargainingModelTwo    | Emergence of Classes: Model Two           | ported                  |
| BargainingModelPeyton | Emergence of Classes: Model Peyton        | ported                  |
| Figure2               | Emergence of Classes: Figure 2            | ported                  |
| Figure3               | Emergence of Classes: Figure 3            | ported                  |
| Figure6               | Emergence of Classes: Figure 6            | ported                  |
| Figure7               | Emergence of Classes: Figure 7            | ported                  |
| Figure8               | Emergence of Classes: Figure 8            | ported                  |
| Figure9               | Emergence of Classes: Figure 9            | ported                  |

## Mapping of the views

The legacy `SimplexView` plots each agent in a triangle by the proportions of high, medium and low demands in its memory. Each model has a `continuousView` of a bounded 2D space holding one dot per agent, placed at those proportions (high bottom left, medium bottom right, low on top; light and dark agents in light and dark grey). Tagged models have a second view for the intergroup memory. Dots are moved after each tick and take no part in the dynamics. The legacy view's second argument (the low demand, apparently used for guide lines) is not drawn. Agents whose counts are not yet defined (the legacy view divides by zero) sit at the centre. The commented-out legacy chart (counts of agents whose last demand was low, medium, high) is the time series `low`, `medium`, `high`.

## Deviations and kept legacy behaviour

- Each tick, `population / 2` agents are drawn independently at random with replacement (legacy `REPEATED_DRAW`), each plays one random other agent (`PLAY_OTHER`).
- `population` (100) is a parameter here; the legacy field was private and fixed.
- The payoffs were static fields in Java, so `BargainingModelPeyton` setting 0.1/0.3/0.5 leaked into every model later run in the same JVM. Here they are ordinary parameters per model. Defaults: 0.3, 0.5 and 0.7 (high is `1 - low` in the legacy code but is not updated if low changes; kept independent).
- Estimated payoffs are computed in 32-bit float arithmetic (`Math.fround`), as in the Java `float`, so exact ties break the same way.
- Kept: a memory of 0 counts (before the first play of tagged agents) gives all-equal estimates, so the first demand is a uniform random pick.
- Kept: in the legacy `Figure6` family the counts are calculated once at start (rule "Intra High/Low", the fourth, always active); `Figure7` selects the first rule of that name by name lookup, which is the high/low start, not the count rule. The Peyton, Two and One models do not calculate counts at start.
- `initializeMemoryRandom(tag)` exists in the legacy code and is ported but unused.
- Random streams differ from Java; runs are deterministic per seed.
- `BargainingModelBase` itself (no views) is not exposed as a model.
