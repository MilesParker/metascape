# Traffic (Ascape example)

"Traffic Model, Miles T. Parker (2002)": a simple traffic model demonstrating that simple rules can elicit complex traffic behavior such as rolling backups. Ported from Ascape 5.6.1 (org.ascape.examples.traffic).

Authors and citation: the About text and sources name only the implementer, Miles Parker (2002). No separate model authors or publication are given, so `provenance.authors` and `provenance.citation` are left out (the credit is in `note`).

Licence: legacy code is BSD (`LICENSES/ascape-license.txt`), Copyright 1998-2007 The Brookings Institution, NuTech Solutions,Inc., Metascape LLC, and contributors. This port is EPL-2.0 (`SPDX: EPL-2.0 AND BSD-3-Clause` on derived files).

| legacy class           | new model or shared file                                | status |
| ---------------------- | ------------------------------------------------------- | ------ |
| `traffic.TrafficModel` | `traffic.ts`: `trafficModel` ("Traffic Model (Ascape)") | ported |
| `traffic.Car`          | `traffic.ts`: `Car`                                     | ported |
| `traffic.RoadTile`     | `traffic.ts`: `RoadTile`                                | ported |

## Rules

An 80 by 6 road; cars are 50% of tiles (240) placed on random free tiles. Each tick each car (in random order) runs Movement and then Lane Changing. A car brakes if a car is "ahead" within its safe distance, otherwise accelerates up to its desired speed; its location within a tile grows by its speed and at 160 it steps to the next tile (wrapping) if that is free, else it waits at 160. Cars change lanes by behavior: cooperators move left when blocked and right when someone is close behind; defectors, when blocked, hop to a random side. All cars are defectors by default (`portionCooperator` is 0).

## Deviations and kept oddities

- `carAhead` and `carBehind` keep the last occupied tile in range (the farthest, not the nearest) and then test a gap computed from the location values. Kept.
- When a car reaches 160 and the next tile is taken, location stays 160 and the speed is not reset by the move itself. When it does advance, the remainder is discarded (location back to 0). Kept.
- Defector lane-change: the second-choice lane is only checked for being open, not for a car ahead. Kept.
- Starting speed equals desired speed; initial placement draws a random free tile per car.
- The legacy view draws the car as a bar at its location within the tile, with red marks when decelerating. Here the car is a coloured square, drawn red while decelerating. Lane markings are not drawn.
- Chart series: legacy Speed and Frustration collectors (count, sum, average, min, max) plot Average Speed and Average Frustration; recorded as `speed.*` and `frustration.*`, plotted as `.mean`.
- Commented-out in the legacy source and NOT ported: Speed Left Lane, Speed Middle Lanes, Speed Right Lane statistics (with a "Lane Speed" chart) and a "Lane Density" chart of counts per lane group.
- Parameter ranges are my own (legacy is unbounded); highway size is fixed at 80 by 6.
