// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.norms.Norms (and its inner class NormCell).
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  bool,
  Cell,
  colors,
  defineModel,
  GridScape,
  gridView,
  gradient,
  real,
  int,
  timeSeriesView,
  barsView,
} from '@metascape/engine';

/** Number of agents on the ring. Private in the legacy model, so not a parameter. */
export const RING_SIZE = 191;
/** The largest sampling radius an agent can grow to: `(size - 1) / 2`. */
export const MAX_RADIUS = (RING_SIZE - 1) / 2;

/** The settings a {@link NormCell} reads from its model. */
export interface NormSettings {
  readonly ambientNoise: number;
  readonly tolerance: number;
  readonly initMaxRadius: number;
  readonly lockIn: boolean;
}

/**
 * One agent on the ring: a binary norm (`strategy`, 0 or 1) and a sampling
 * radius. Agents never move; they update norm and radius from the agents
 * within their radius.
 */
export class NormCell extends Cell {
  strategy = 0;
  radius = 0;
  #near: readonly NormCell[] = [];
  #nearMinusOne: readonly NormCell[] = [];
  #nearPlusOne: readonly NormCell[] = [];
  readonly #settings: NormSettings;

  constructor(settings: NormSettings) {
    super();
    this.#settings = settings;
  }

  override initialize(): void {
    // The "lock-in" start of Figure 1 in the paper is the commented alternative `setStrategy(0)`.
    this.strategy = this.#settings.lockIn ? 0 : this.random.chance(0.5) ? 0 : 1;
    this.setRadius(this.random.int(0, this.#settings.initMaxRadius));
  }

  /** Sets the radius (at least 1) and recomputes which cells are sampled. */
  setRadius(radius: number): void {
    this.radius = radius >= 1 ? radius : 1;
    this.#findNearCells();
  }

  #findNearCells(): void {
    const grid = this.grid as GridScape<NormCell>;
    const options = { metric: 'chebyshev', includeSelf: true } as const;
    this.#near = grid.within(this, this.radius, options);
    this.#nearMinusOne = grid.within(this, this.radius - 1, options);
    this.#nearPlusOne = grid.within(this, this.radius + 1, options);
  }

  /** The legacy rule "Update Radius & Strategy". */
  update(): void {
    this.updateRadius();
    this.updateStrategy();
  }

  updateRadius(): void {
    const tolerance = this.#settings.tolerance;
    const average = averageStrategy(this.#near);
    const averageMinusOne = averageStrategy(this.#nearMinusOne);
    const averagePlusOne = averageStrategy(this.#nearPlusOne);
    if (averagePlusOne <= average - tolerance || averagePlusOne >= average + tolerance) {
      this.setRadius(Math.min(this.radius + 1, MAX_RADIUS));
    } else if (averageMinusOne >= average - tolerance || averageMinusOne <= average + tolerance) {
      // Always true, as in the legacy code: the radius shrinks whenever it did not grow.
      this.setRadius(this.radius - 1);
    }
  }

  updateStrategy(): void {
    if (this.random.float() > this.#settings.ambientNoise) {
      this.strategy = averageStrategy(this.#near) < 0.5 ? 0 : 1;
    } else {
      this.strategy = this.random.chance(0.5) ? 0 : 1;
    }
  }
}

function averageStrategy(cells: readonly NormCell[]): number {
  if (cells.length === 0) return 0;
  let sum = 0;
  for (const cell of cells) sum += cell.strategy;
  return sum / cells.length;
}

/** "Learning to be thoughtless": agents on a ring adapt both their norm and their sampling radius. */
export const norms = defineModel({
  name: 'Norms',
  description:
    'A ring of agents, each holding a binary norm (such as driving on the left or the right) and a sampling radius. Agents adopt the majority norm within their radius and adjust the radius incrementally, so that the radius evolves with the stability of the norm.',
  provenance: {
    authors: 'Joshua M. Epstein',
    citation:
      'Epstein, J. M. (2001). Learning to be thoughtless: Social norms and individual computation. Computational Economics, 18(1), 9-24.',
    portedFrom: 'Ascape 5.6.1, edu.brook.norms.Norms',
    copyright:
      'Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.',
    note: 'Implemented in Java by Miles Parker from a C++ model by Joshua M. Epstein. The initial lock-in case of Figure 1 is the parameter lockIn.',
  },
  parameters: {
    ambientNoise: real(0.03, {
      min: 0,
      max: 1,
      label: 'Ambient noise',
      description: 'Probability per update that an agent picks its norm at random.',
    }),
    tolerance: real(0.05, {
      min: 0,
      max: 1,
      label: 'Tolerance',
      description: 'How different the norm average must be at the next radius to grow the radius.',
    }),
    initMaxRadius: int(10, {
      min: 1,
      max: MAX_RADIUS,
      label: 'Initial maximum radius',
      description:
        'Initial radii are drawn from 0 up to (not including) this value, and raised to at least 1.',
    }),
    lockIn: bool(false, {
      label: 'Initial lock-in',
      description:
        'Start with every agent holding norm 0 (the case of Figure 1 in the paper) instead of random norms.',
    }),
  } as const,
  build(sim) {
    const p = sim.parameters;
    const settings: NormSettings = {
      ambientNoise: p.ambientNoise,
      tolerance: p.tolerance,
      initMaxRadius: p.initMaxRadius,
      lockIn: p.lockIn,
    };
    // A 1 x 191 wrapped strip is the ring; chebyshev distance along it is ring distance.
    const ring = sim.addScape(
      new GridScape<NormCell>({
        name: 'Norm Model',
        width: RING_SIZE,
        height: 1,
        wrap: true,
        // Each tick, as many agents act as there are agents, drawn with replacement (REPEATED_DRAW).
        sampling: 'draw',
        activations: RING_SIZE,
        create: () => new NormCell(settings),
      }),
    );
    ring.addRule('Update Radius & Strategy', (cell) => cell.update());

    sim.data.measure(ring, 'radius', (cell) => cell.radius, {
      statistics: ['min', 'mean', 'max', 'variance', 'stdDev'],
    });
    // The legacy chart labelled these the other way round ("Yellow" counts norm 0).
    sim.data.count(ring, 'strategy0', (cell) => cell.strategy === 0);
    sim.data.count(ring, 'strategy1', (cell) => cell.strategy === 1);

    sim.addView(
      gridView<NormCell>({
        title: 'Strategy',
        grid: ring,
        cellColor: (cell) => (cell.strategy === 0 ? colors.blue : colors.yellow),
      }),
    );
    const shade = gradient(colors.white, colors.black);
    sim.addView(
      gridView<NormCell>({
        title: 'Radius',
        grid: ring,
        cellColor: (cell) => shade(Math.min(1, Math.max(0, (cell.radius - 1) / 4))),
      }),
    );
    sim.addView(
      timeSeriesView({
        title: 'Sampling radius',
        series: ['radius.variance', 'radius.stdDev', 'radius.min', 'radius.mean', 'radius.max'],
        colors: {
          'radius.variance': colors.blue,
          'radius.stdDev': colors.yellow,
          'radius.min': colors.red,
          'radius.mean': colors.orange,
          'radius.max': colors.red,
        },
        yMin: 0,
      }),
    );
    sim.addView(
      barsView({
        title: 'Norms held',
        series: ['strategy0', 'strategy1'],
        colors: { strategy0: colors.blue, strategy1: colors.yellow },
      }),
    );
  },
});
