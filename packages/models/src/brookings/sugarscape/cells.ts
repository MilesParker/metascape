// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.sugarscape.SugarCell, SpiceCell,
// PollutableSugarCell, SugarSeasonalGrowBackRule.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import { Cell, type Rule } from '@metascape/engine';
import { ascapeDiffusion, type Diffusable } from './ascape-space';
import { CommoditySource, type SugarscapeWorld } from './world';

/** `SugarCell.MAX_SUGAR`: the highest sugar capacity. */
export const MAX_SUGAR = 4;
/** `SpiceCell.MAX_SPICE`: the highest spice capacity. */
export const MAX_SPICE = 5;

/** A peak position as a fraction of the lattice extent. */
type PeakFractions = readonly (readonly [fx: number, fy: number])[];

/** `SugarCell.sugarPeaks`: (0.8, 0.2) and (0.3, 0.7) of the extent, that is (40, 10) and (15, 35) on 50 x 50. */
export const SUGAR_PEAKS: PeakFractions = [
  [0.8, 0.2],
  [0.3, 0.7],
];
/** `SpiceCell.spicePeaks`: (0.3, 0.2) and (0.8, 0.7) of the extent, that is (15, 10) and (40, 35) on 50 x 50. */
export const SPICE_PEAKS: PeakFractions = [
  [0.3, 0.2],
  [0.8, 0.7],
];

/**
 * The legacy capacity map, exactly as `SugarCell.initialize` computes it:
 * `round(max * min(1, sum over peaks of exp(-moundness * distance^2)))`, with
 * Euclidean (non-wrapping) distance to each peak and Java's single-precision
 * `float` accumulation and `Math.round(float)`.
 */
export function capacityAt(
  x: number,
  y: number,
  width: number,
  height: number,
  peaks: PeakFractions,
  moundness: number,
  max: number,
): number {
  const m = Math.fround(moundness);
  let calc = Math.fround(0);
  for (const [fx, fy] of peaks) {
    const px = Math.trunc(width * fx);
    const py = Math.trunc(height * fy);
    const distance = Math.sqrt((x - px) * (x - px) + (y - py) * (y - py));
    calc = Math.fround(calc + Math.exp(-m * Math.pow(distance, 2)));
  }
  const scaled = Math.fround(max * Math.min(1, calc));
  return Math.floor(Math.fround(scaled + 0.5));
}

/** `SugarCell`: a lattice site holding renewable sugar. */
export class SugarCell extends Cell {
  readonly world: SugarscapeWorld;
  readonly sugar = new CommoditySource();

  constructor(world: SugarscapeWorld) {
    super();
    this.world = world;
  }

  /** Sets capacity from the two-peak map and fills the cell. */
  override initialize(): void {
    const grid = this.world.grid;
    this.sugar.capacity = capacityAt(
      this.x,
      this.y,
      grid.width,
      grid.height,
      SUGAR_PEAKS,
      this.world.settings.sugarMoundness,
      MAX_SUGAR,
    );
    this.sugar.quantity = this.sugar.capacity;
  }

  /** What a sugar-only agent sees when it looks at this cell. */
  getPerceivedValue(): number {
    return this.sugar.quantity;
  }

  /** Harvests all the sugar. */
  takeSugar(): number {
    return this.sugar.takeQuantity();
  }
}

/** `SpiceCell`: a site holding renewable sugar and spice. */
export class SpiceCell extends SugarCell {
  readonly spice = new CommoditySource();

  override initialize(): void {
    super.initialize();
    const grid = this.world.grid;
    this.spice.capacity = capacityAt(
      this.x,
      this.y,
      grid.width,
      grid.height,
      SPICE_PEAKS,
      this.world.spiceSettings().spiceMoundness,
      MAX_SPICE,
    );
    this.spice.quantity = this.spice.capacity;
  }

  override getPerceivedValue(): number {
    return this.spice.quantity * this.sugar.quantity;
  }

  /** The welfare an agent would have here: (sugar held + here) / m_s times (spice held + here) / m_p. */
  getPotentialValue(
    someSugar: number,
    someSpice: number,
    sugarMetabolism: number,
    spiceMetabolism: number,
  ): number {
    return (
      ((someSugar + this.sugar.quantity) / sugarMetabolism) *
      ((someSpice + this.spice.quantity) / spiceMetabolism)
    );
  }

  takeSpice(): number {
    return this.spice.takeQuantity();
  }
}

/** `PollutableSugarCell`: a sugar cell that accumulates pollution, which diffuses. */
export class PollutableSugarCell extends SugarCell implements Diffusable {
  /** `sigma`: pollution per unit of sugar harvested. */
  static readonly SIGMA = 8;
  pollution = 0;
  diffusionTemp = 0;

  override initialize(): void {
    super.initialize();
    this.pollution = 0;
    this.world.maxPollution = 1;
  }

  override takeSugar(): number {
    this.addPollution(PollutableSugarCell.SIGMA * this.sugar.quantity);
    return super.takeSugar();
  }

  override getPerceivedValue(): number {
    return this.sugar.quantity / (1 + this.pollution);
  }

  setPollution(pollution: number): void {
    this.pollution = pollution;
    if (pollution > this.world.maxPollution) this.world.maxPollution = pollution;
  }

  addPollution(pollution: number): void {
    this.setPollution(this.pollution + pollution);
  }
}

/** `SugarCell.SUGAR_GROW_BACK_1_RULE`. */
export const SUGAR_GROW_BACK_1_RULE: Rule<SugarCell> = {
  name: 'Sugar-Grow Back 1',
  execute: (cell) => cell.sugar.growBack1(),
};

/** `SugarCell.SUGAR_GROW_BACK_INF_RULE`. */
export const SUGAR_GROW_BACK_INF_RULE: Rule<SugarCell> = {
  name: 'Sugar-Grow Back Infinite',
  execute: (cell) => cell.sugar.growBackInf(),
};

/** `SpiceCell.SUGAR_SPICE_GROW_BACK_1_RULE`. */
export const SUGAR_SPICE_GROW_BACK_1_RULE: Rule<SpiceCell> = {
  name: 'Spice Grow Back 1',
  execute: (cell) => {
    cell.sugar.growBack1();
    cell.spice.growBack1();
  },
};

/** `SpiceCell.SUGAR_SPICE_GROW_BACK_INF_RULE`. */
export const SUGAR_SPICE_GROW_BACK_INF_RULE: Rule<SpiceCell> = {
  name: 'Spice Grow Back Infinte',
  execute: (cell) => {
    cell.sugar.growBackInf();
    cell.spice.growBackInf();
  },
};

/** The pollution diffusion rule `PollutableSugarCell.scapeCreated` adds. */
export function pollutionDiffusionRule(): Rule<PollutableSugarCell> {
  return ascapeDiffusion<PollutableSugarCell>(
    'Pollution',
    (cell) => cell.pollution,
    (cell, value) => cell.setPollution(value),
  );
}

/**
 * `SugarSeasonalGrowBackRule`: in "summer" the top half (y < 25) grows back one
 * unit per tick and the bottom half `epsilon`; in "winter" the reverse. The
 * season test is the legacy one: summer when the fractional part of
 * `iteration / (2 * seasonLength)` exceeds 0.5, so with length 50 ticks 1-50
 * are winter in the top half.
 */
export function sugarSeasonalGrowBackRule(epsilon: number, seasonLength: number): Rule<SugarCell> {
  return {
    name: 'Sugar Grow Back Seasonally',
    execute(cell) {
      const iter = cell.sim.tick;
      const period = seasonLength * 2;
      const fraction = Math.fround(iter / period) - Math.trunc(iter / period);
      const top = cell.y < 25;
      if (fraction > 0.5) {
        if (top) cell.sugar.growBack1();
        else cell.sugar.growBackEpsilon(epsilon);
      } else if (top) {
        cell.sugar.growBackEpsilon(epsilon);
      } else {
        cell.sugar.growBack1();
      }
    },
  };
}
