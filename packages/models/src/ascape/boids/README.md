# Boids (Ascape example)

Craig Reynolds' Boids (1987), "the classic A-Life model, depicting flocking from simple rules", as implemented by Miles Parker for Ascape (org.ascape.examples.boids). Ported from Ascape 5.6.1.

Citation: Reynolds, C. W. (1987). Flocks, herds, and schools: A distributed behavioral model. Computer Graphics, 21(4), 25-34.

Licence: the legacy code is BSD (`LICENSES/ascape-license.txt`), Copyright 1998-2007 The Brookings Institution, NuTech Solutions,Inc., Metascape LLC, and contributors. This port is EPL-2.0 (`SPDX: EPL-2.0 AND BSD-3-Clause` on derived files).

| legacy class           | new model or shared file                                        | status                   |
| ---------------------- | --------------------------------------------------------------- | ------------------------ |
| `boids.BaseModel`      | `boids.ts`: `boidsAscape` ("Boids (Ascape)")                    | ported                   |
| `boids.Boid`           | `boids.ts`: `Boid`                                              | ported                   |
| `boids.Obstacle`       | `boids.ts`: `Obstacle`, `placeObstacle`                         | ported                   |
| `boids.view.BoidsView` | `continuousView` (heading pointers; red, blue, black obstacles) | not ported: UI only      |
| `boids.view.Test`      | none                                                            | not ported: test harness |

`view/Test.java` is an unrelated puzzle main method (a random search for a short trip order of four numbers); it has no model logic. It carries a NuTech "confidential" block that the copyright owner has confirmed is a mistake; nothing from it was copied.

## Deviations and kept oddities

- Red boids never flock. The legacy code adds the collision, cohesion and alignment rules to the red scape with `select = false`, so they never run. Red boids only avoid obstacles and move: without obstacles each red boid flies a straight line at its random initial heading. Kept.
- Rule order per boid: iterate (clears the priority marker), avoid obstacles, avoid collisions, cohesion, alignment, movement; later steering rules yield once a earlier one has acted. Alignment always claims the marker, even with no neighbours.
- Legacy has separate Red, Blue, Boids, Obstacles scapes inside a World; here one `world` scape holds all boids and obstacles. Teams only interact through static obstacles, so running reds and blues in one shuffled order is statistically the same as red then blue. The legacy "Iterate" rule on the combined Boids scape ran before both teams; it only clears each boid's own marker, so it is a first rule here.
- Headings are not normalized and `headAway` / `headToward` use raw coordinates without wrapping, as in Ascape. Cohesion's centre of mass can lie outside the world; distance uses Ascape's periodic formula (`periodicDistance`) which tolerates that. "Self" is excluded from searches by coordinate equality (tolerance 1e-10), and nearest-ties are broken at random, as in Ascape.
- Alignment uses the sentinel -1 for "no neighbours", so a true average of exactly -1 would be ignored; kept.
- Movement wraps once (as `Continuous2D.normalize`); the engine then maps a coordinate exactly equal to 50 to 0.
- Obstacles: the legacy model starts with none and obstacles are added by shift-click in the view. Here there is no parameter; `placeObstacle(sim, x, y)` does the same (obstacles added after setup).
- `agentSize` is a legacy parameter used only for drawing; it sets the view radius.
- The legacy model has no statistics or charts. Added by the port: heading agreement (polarization) and mean nearest team-mate distance, per team.
- World size 50 by 50 is fixed (not a legacy parameter). Initial positions are uniform in the plane; headings uniform in [0, 2 pi).
