// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: org.ascape.examples.traffic.TrafficModel, Car, RoadTile.
// Original: Copyright 1998-2007 The Brookings Institution, NuTech Solutions,Inc., Metascape LLC, and contributors.
// All rights reserved. Used under the BSD license in LICENSES/ascape-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  Cell,
  defineModel,
  GridScape,
  gridView,
  Occupant,
  real,
  rgb,
  Scape,
  timeSeriesView,
  colors,
  type Rule,
  type Simulation,
} from '@metascape/engine';

/** Length of the highway in cells (legacy `highway.setExtent(80, 6)`). */
export const HIGHWAY_LENGTH = 80;
/** Number of lanes. Lane 0 is the "left" lane. */
export const LANES = 6;
/** Distance units that make up one cell: a car advances a cell once its location reaches this. */
export const CELL_LENGTH = 160;

/** How a car is currently driving. */
export type Mode = 'accelerating' | 'decelerating' | 'coasting';
/** Lane-changing style. */
export type Behavior = 'cooperator' | 'defector';

/** Ranges drawn from for each car, plus the share of cooperators. */
export interface CarSettings {
  readonly minSpeed: number;
  readonly maxSpeed: number;
  readonly minSafeDistance: number;
  readonly maxSafeDistance: number;
  readonly minAcceleration: number;
  readonly maxAcceleration: number;
  readonly minDeceleration: number;
  readonly maxDeceleration: number;
  readonly portionCooperator: number;
}

/** A tile of road. Legacy `RoadTile`: neighbours along and across the highway. */
export class RoadTile extends Cell {
  #at(x: number, y: number): RoadTile {
    return this.grid.at(x, y) as RoadTile;
  }

  /** The tile in the lane to the left (lower lane index), or undefined at the edge. */
  cellLeft(): RoadTile | undefined {
    return this.y - 1 >= 0 ? this.#at(this.x, this.y - 1) : undefined;
  }

  /** The tile in the lane to the right, or undefined at the edge. */
  cellRight(): RoadTile | undefined {
    return this.y + 1 < this.grid.height ? this.#at(this.x, this.y + 1) : undefined;
  }

  /** The tile `distance` ahead (default 1), wrapping once round the road. */
  cellAhead(distance = 1): RoadTile {
    let x = this.x + distance;
    if (x >= this.grid.width) x -= this.grid.width;
    return this.#at(x, this.y);
  }

  /** The tile `distance` behind, wrapping once round the road. */
  cellBehind(distance: number): RoadTile {
    let x = this.x - distance;
    if (x < 0) x += this.grid.width;
    return this.#at(x, this.y);
  }
}

/** A car. Legacy `Car`. */
export class Car extends Occupant<RoadTile> {
  mode: Mode = 'coasting';
  actualSpeed = 0;
  /** Position within the current cell, in 0..160. */
  location = 0;
  desiredSpeed = 0;
  safeDistance = 0;
  acceleration = 0;
  deceleration = 0;
  behavior: Behavior = 'defector';
  /** Display colour, random per car. */
  color = 0;

  readonly #settings: CarSettings;

  constructor(settings: CarSettings) {
    super();
    this.#settings = settings;
  }

  #range(min: number, max: number): number {
    return min + this.random.float() * (max - min);
  }

  /** Legacy `Car.initialize`. */
  override initialize(): void {
    const s = this.#settings;
    this.desiredSpeed = this.#range(s.minSpeed, s.maxSpeed);
    this.safeDistance = this.#range(s.minSafeDistance, s.maxSafeDistance);
    this.acceleration = this.#range(s.minAcceleration, s.maxAcceleration);
    this.deceleration = this.#range(s.minDeceleration, s.maxDeceleration);
    this.actualSpeed = this.desiredSpeed;
    this.location = 0;
    this.color = rgb(
      this.random.float() * 255,
      this.random.float() * 255,
      this.random.float() * 255,
    );
    this.behavior = this.random.float() < s.portionCooperator ? 'cooperator' : 'defector';
  }

  /**
   * Legacy `carAhead`: scans every tile up to `distance` ahead and keeps the
   * LAST occupied one (the farthest, not the nearest), then reports it if the
   * gap, measured with the location offsets, is within `distance`.
   */
  carAhead(distance: number, tile: RoadTile | undefined = this.cell): Car | undefined {
    if (!tile) return undefined;
    let nearest: Car | undefined;
    let cells: number;
    for (cells = 1; cells <= distance; cells++) {
      const candidate = tile.cellAhead(cells);
      if (!candidate.isAvailable) nearest = candidate.occupant as Car;
    }
    if (nearest && this.location - nearest.location + cells - 1.0 <= distance) return nearest;
    return undefined;
  }

  /** Legacy `carBehind`, with the same keep-the-last quirk as {@link carAhead}. */
  carBehind(distance: number, tile: RoadTile | undefined = this.cell): Car | undefined {
    if (!tile) return undefined;
    let nearest: Car | undefined;
    let cells: number;
    for (cells = 1; cells <= distance; cells++) {
      const candidate = tile.cellBehind(cells);
      if (!candidate.isAvailable) nearest = candidate.occupant as Car;
    }
    if (nearest && this.location - nearest.location + cells - 1.0 <= distance) return nearest;
    return undefined;
  }

  /** Whether a tile is free with no car within the safe distance ahead or behind it. */
  isOpen(tile: RoadTile): boolean {
    return (
      tile.isAvailable &&
      this.carBehind(this.safeDistance, tile) === undefined &&
      this.carAhead(this.safeDistance, tile) === undefined
    );
  }

  /** Legacy `changeLanes`. */
  changeLanes(): void {
    const here = this.cell;
    if (!here) return;
    const safe = this.safeDistance;
    if (this.behavior === 'cooperator') {
      if (this.carAhead(safe)) {
        // Can't go as fast as wanted: try to move left.
        const left = here.cellLeft();
        if (left && this.isOpen(left) && this.carAhead(safe, left) === undefined) this.moveTo(left);
      } else if (this.carBehind(safe * 2.0)) {
        // Someone is coming up behind: move over to the right to let them pass.
        const right = here.cellRight();
        if (right && this.isOpen(right) && this.carAhead(safe, right) === undefined) {
          this.moveTo(right);
        }
      }
    } else if (this.carAhead(safe)) {
      // Defector: hop to a random side with an opening, preferring that side's clear lane.
      if (this.random.chance(0.5)) {
        const left = here.cellLeft();
        if (left && this.isOpen(left) && this.carAhead(safe, left) === undefined) {
          this.moveTo(left);
        } else {
          const right = here.cellRight();
          if (right && this.isOpen(right)) this.moveTo(right);
        }
      } else {
        const right = here.cellRight();
        if (right && this.isOpen(right) && this.carAhead(safe, right) === undefined) {
          this.moveTo(right);
        } else {
          const left = here.cellLeft();
          if (left && this.isOpen(left)) this.moveTo(left);
        }
      }
    }
  }

  /** Legacy `Car.movement`: adjust speed, advance, and hop to the next tile at 160. */
  movement(): void {
    const here = this.cell;
    if (!here) return;
    const candidate = here.cellAhead();
    if (this.carAhead(this.safeDistance) === undefined) {
      if (this.actualSpeed < this.desiredSpeed) {
        this.mode = 'accelerating';
        this.actualSpeed += this.acceleration;
      } else {
        this.mode = 'coasting';
      }
    } else {
      this.mode = 'decelerating';
      this.actualSpeed -= this.deceleration;
      if (this.actualSpeed < 0.0) this.actualSpeed = 0.0;
    }
    this.location += this.actualSpeed;
    if (this.location >= CELL_LENGTH) {
      if (candidate.isAvailable) {
        this.location = 0.0;
        this.moveTo(candidate);
      } else {
        this.location = CELL_LENGTH;
      }
    }
  }
}

/** The parameters of the model; legacy defaults. */
export const parameters = {
  maxSpeed: real(90, {
    min: 0,
    max: 300,
    label: 'Maximum speed',
    description: "Upper bound of cars' desired speed.",
  }),
  minSpeed: real(60, {
    min: 0,
    max: 300,
    label: 'Minimum speed',
    description: "Lower bound of cars' desired speed.",
  }),
  minSafeDistance: real(1, {
    min: 0,
    max: 10,
    label: 'Minimum safe distance',
    description: 'Lower bound of the following distance, in cells.',
  }),
  maxSafeDistance: real(3, {
    min: 0,
    max: 10,
    label: 'Maximum safe distance',
    description: 'Upper bound of the following distance, in cells.',
  }),
  minAcceleration: real(1.5, {
    min: 0,
    max: 50,
    label: 'Minimum acceleration',
    description: "Lower bound of cars' acceleration per tick.",
  }),
  maxAcceleration: real(3, {
    min: 0,
    max: 50,
    label: 'Maximum acceleration',
    description: "Upper bound of cars' acceleration per tick.",
  }),
  minDeceleration: real(2, {
    min: 0,
    max: 50,
    label: 'Minimum deceleration',
    description: "Lower bound of cars' braking per tick.",
  }),
  maxDeceleration: real(4, {
    min: 0,
    max: 50,
    label: 'Maximum deceleration',
    description: "Upper bound of cars' braking per tick.",
  }),
  portionCooperator: real(0, {
    min: 0,
    max: 1,
    label: 'Portion cooperating',
    description: 'Share of cars that change lanes politely rather than selfishly.',
  }),
  trafficDensity: real(0.5, {
    min: 0,
    max: 1,
    label: 'Traffic density',
    description: 'Cars as a share of road tiles.',
  }),
} as const;

/**
 * A simple traffic model: cars on a six-lane ring road, each following simple
 * speed and lane-changing rules, from which rolling backups emerge.
 */
export const trafficModel = defineModel({
  name: 'Traffic Model (Ascape)',
  description:
    'A simple traffic model demonstrating that simple rules can elicit complex traffic behavior such as rolling backups.',
  provenance: {
    portedFrom: 'Ascape 5.6.1, org.ascape.examples.traffic.TrafficModel',
    copyright:
      'Copyright 1998-2007 The Brookings Institution, NuTech Solutions,Inc., Metascape LLC, and contributors.',
    note: 'Traffic Model, Miles T. Parker (2002), as titled in the Ascape About text. No further authors or citation are given in the sources.',
  },
  parameters,
  build(sim: Simulation<typeof parameters>) {
    const p = sim.parameters;
    const highway = sim.addScape(
      new GridScape<RoadTile>({
        name: 'Highway',
        width: HIGHWAY_LENGTH,
        height: LANES,
        wrap: false,
        create: () => new RoadTile(),
      }),
    );
    const settings: CarSettings = { ...p };
    const cars = sim.addScape(
      new Scape<Car>({
        name: 'Cars',
        size: Math.trunc(HIGHWAY_LENGTH * LANES * p.trafficDensity),
        create: () => new Car(settings),
      }),
    );
    cars.addInitialRule('Move To Random Location', (car) => {
      const cell = highway.randomAvailableCell();
      if (cell) car.moveTo(cell);
      else car.die();
    });
    cars.addRule('Movement', (car) => car.movement());
    const laneChanging: Rule<Car> = { name: 'Lane Changing', execute: (car) => car.changeLanes() };
    cars.addRule(laneChanging);

    sim.data.measure(cars, 'speed', (car) => car.actualSpeed);
    sim.data.measure(cars, 'frustration', (car) => car.desiredSpeed - car.actualSpeed);

    sim.addView(
      gridView<RoadTile, Car>({
        title: 'Helicopter View',
        grid: highway,
        cellColor: () => colors.gray,
        occupantColor: (car) => (car.mode === 'decelerating' ? colors.red : car.color),
        occupantShape: 'square',
      }),
    );
    sim.addView(
      timeSeriesView({
        title: 'Frustration',
        series: ['speed.mean', 'frustration.mean'],
        colors: { 'speed.mean': colors.green, 'frustration.mean': colors.red },
      }),
    );
  },
});
