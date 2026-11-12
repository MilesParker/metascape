// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.diffusion.ABCModel, ABCCell, ABCDEFModel and ABCDEFCell.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import {
  GridScape,
  gridView,
  real,
  timeSeriesView,
  type Color,
  type Provenance,
  type Simulation,
} from '@metascape/engine';
import { ACTION_COLORS, ActionCell, type ActionSettings } from './action-cell';

/** Where the Diffusion models come from, shared by all of them. */
export const DIFFUSION_COPYRIGHT =
  'Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.';

/** Credit for the science of the Diffusion models, from `AboutDiffusion.html`. */
export const DIFFUSION_AUTHORS = 'H. Peyton Young';

/** The reference given in `AboutDiffusion.html`; the About text gives no year. */
export const DIFFUSION_CITATION =
  'Young, H. P. Diffusion in Social Networks. CSED Working Paper #2, The Brookings Institution.';

/** Builds the provenance of one Diffusion model. */
export function diffusionProvenance(legacyClass: string, note: string): Provenance {
  return {
    authors: DIFFUSION_AUTHORS,
    citation: DIFFUSION_CITATION,
    portedFrom: `Ascape 5.6.1, edu.brook.diffusion.${legacyClass}`,
    copyright: DIFFUSION_COPYRIGHT,
    note,
  };
}

const payoff = (label: string, defaultValue: number) =>
  real(defaultValue, {
    min: -200,
    max: 200,
    label,
    description: 'Inherent payoff of the action for cells of this characteristic.',
  });

/** The inherent payoffs of the first three actions (ABC and ABCDEF models). */
export const matrixABCParameters = {
  matrixHA: payoff('Matrix H/A', 34),
  matrixHB: payoff('Matrix H/B', 42.5),
  matrixHC: payoff('Matrix H/C', 51),
  matrixMA: payoff('Matrix M/A', 28),
  matrixMB: payoff('Matrix M/B', 35),
  matrixMC: payoff('Matrix M/C', 0),
  matrixLA: payoff('Matrix L/A', 24),
  matrixLB: payoff('Matrix L/B', 0),
  matrixLC: payoff('Matrix L/C', 0),
} as const;

/** The inherent payoffs of the extra actions D, E and F (ABCDEF models). */
export const matrixDEFParameters = {
  matrixHD: payoff('Matrix H/D', 8.5),
  matrixHE: payoff('Matrix H/E', 17),
  matrixHF: payoff('Matrix H/F', 25.5),
  matrixMD: payoff('Matrix M/D', 7),
  matrixME: payoff('Matrix M/E', 14),
  matrixMF: payoff('Matrix M/F', 21),
  matrixLD: payoff('Matrix L/D', 6),
  matrixLE: payoff('Matrix L/E', 12),
  matrixLF: payoff('Matrix L/F', 18),
} as const;

/** Parameter values of the matrix, as the models declare them. */
export type MatrixValues = {
  readonly [K in keyof typeof matrixABCParameters]: number;
} & Partial<{ readonly [K in keyof typeof matrixDEFParameters]: number }>;

/** Collects matrix parameters into {@link ActionSettings}. */
export function actionSettings(
  actions: 3 | 6,
  beta: number,
  gamma: number,
  p: MatrixValues,
): ActionSettings {
  const row = (
    a: number,
    b: number,
    c: number,
    d: number | undefined,
    e: number | undefined,
    f: number | undefined,
  ): number[] => (actions === 3 ? [a, b, c] : [a, b, c, d ?? 0, e ?? 0, f ?? 0]);
  return {
    actions,
    beta,
    gamma,
    matrix: {
      H: row(p.matrixHA, p.matrixHB, p.matrixHC, p.matrixHD, p.matrixHE, p.matrixHF),
      M: row(p.matrixMA, p.matrixMB, p.matrixMC, p.matrixMD, p.matrixME, p.matrixMF),
      L: row(p.matrixLA, p.matrixLB, p.matrixLC, p.matrixLD, p.matrixLE, p.matrixLF),
    },
  };
}

/** Options of {@link buildActionModel}. */
export interface ActionModelOptions {
  readonly span: number;
  readonly settings: ActionSettings;
  /** Colour of each action, A first. */
  readonly palette: readonly Color[];
  /** Series names of each action in the statistics, as the legacy collectors named them. */
  readonly labels: readonly string[];
  /** Colour of each action in the charts (the legacy chart series colours). */
  readonly chartColors: readonly Color[];
}

/**
 * Builds the `cells` scape shared by the ABC and ABCDEF models: a Moore lattice
 * (periodic) on which, each step, 25 cells chosen by repeated random draw
 * decide their action. The legacy statistics count each action in the upper and
 * lower half of the lattice, with one chart for each half.
 */
export function buildActionModel(sim: Simulation, options: ActionModelOptions): void {
  const { span, settings, palette, labels, chartColors } = options;
  const cells = sim.addScape(
    new GridScape<ActionCell>({
      name: 'cells',
      width: span,
      height: span,
      wrap: true,
      neighborhood: 'moore',
      // setExecutionStyle(REPEATED_DRAW); setAgentsPerIteration(25).
      activations: 25,
      sampling: 'draw',
      create: () => new ActionCell(),
    }),
  );
  cells.addRule('Decide action', (cell) => cell.decideAction(settings));

  const aboveColors: Record<string, Color> = {};
  const belowColors: Record<string, Color> = {};
  const above: string[] = [];
  const below: string[] = [];
  labels.forEach((label, action) => {
    const aboveId = `${label} Above`;
    const belowId = `${label} Below`;
    sim.data.count(cells, aboveId, (cell) => cell.action === action && cell.isAbove);
    sim.data.count(cells, belowId, (cell) => cell.action === action && !cell.isAbove);
    above.push(aboveId);
    below.push(belowId);
    aboveColors[aboveId] = chartColors[action] ?? palette[action] ?? 0;
    belowColors[belowId] = chartColors[action] ?? palette[action] ?? 0;
  });

  sim.addView(
    gridView<ActionCell>({
      title: 'Cells',
      grid: cells,
      cellColor: (cell) => palette[cell.action] ?? ACTION_COLORS[0] ?? 0,
    }),
  );
  sim.addView(timeSeriesView({ title: 'Action Above', series: above, colors: aboveColors }));
  sim.addView(timeSeriesView({ title: 'Action Below', series: below, colors: belowColors }));
}
