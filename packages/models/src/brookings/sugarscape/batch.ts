// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.sugarscape.MultipleGAS_II_2, MultipleGAS_IV_a,
// MultipleGAS_IV_b, MultipleGAS_IV_c, MultipleGAS_IV_d, MultipleGAS_IV_e, MultipleGAS_IV_f,
// MultipleGAS_IV_g, MultipleGAS_IV_h, MultipleGAS_IV_i.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import type {
  ExperimentDesign,
  ExperimentValue,
  Model,
  ParameterSchema,
  Simulation,
} from '@metascape/engine';
import { gasII2 } from './chapter-2';
import {
  gasIVa,
  gasIVb,
  gasIVc,
  gasIVd,
  gasIVe,
  gasIVf,
  gasIVg,
  gasIVh,
  gasIVi,
} from './chapter-4';

/**
 * A legacy `Multiple*` class: not a model of its own but a batch harness that
 * runs an existing model without graphics, writes every statistic each period
 * to a file (`DataOutputView`) and stops at a fixed period.
 */
export interface SugarscapeBatch<S extends ParameterSchema = ParameterSchema> {
  /** The legacy class, such as `MultipleGAS_IV_a`. */
  readonly legacyClass: string;
  /** The model it runs. */
  readonly model: Model<S>;
  /** An experiment design for `runExperiment(model, design)`. */
  readonly design: ExperimentDesign<S>;
}

/** The final value of every recorded series, as the last line of the legacy data file would hold. */
export function finalValues(sim: Simulation): Record<string, ExperimentValue> {
  const row: Record<string, ExperimentValue> = {};
  for (const series of sim.data.series) row[series.id] = sim.data.latest(series.id);
  return row;
}

function batch<S extends ParameterSchema>(
  legacyClass: string,
  model: Model<S>,
  stopPeriod: number,
): SugarscapeBatch<S> {
  return {
    legacyClass,
    model,
    design: {
      maxTicks: stopPeriod,
      replicates: 1,
      measure: finalValues,
    },
  };
}

/** `MultipleGAS_II_2`: GAS_II_2 to period 100. */
export const multipleGasII2 = batch('MultipleGAS_II_2', gasII2, 100);
/** `MultipleGAS_IV_a`: GAS_IV_a to period 1000. */
export const multipleGasIVa = batch('MultipleGAS_IV_a', gasIVa, 1000);
/** `MultipleGAS_IV_b`: GAS_IV_b to period 2000. */
export const multipleGasIVb = batch('MultipleGAS_IV_b', gasIVb, 2000);
/** `MultipleGAS_IV_c`: GAS_IV_c to period 100. */
export const multipleGasIVc = batch('MultipleGAS_IV_c', gasIVc, 100);
/** `MultipleGAS_IV_d`: GAS_IV_d to period 100. */
export const multipleGasIVd = batch('MultipleGAS_IV_d', gasIVd, 100);
/** `MultipleGAS_IV_e`: GAS_IV_e to period 100. */
export const multipleGasIVe = batch('MultipleGAS_IV_e', gasIVe, 100);
/** `MultipleGAS_IV_f`: GAS_IV_f to period 100. */
export const multipleGasIVf = batch('MultipleGAS_IV_f', gasIVf, 100);
/** `MultipleGAS_IV_g`: GAS_IV_g to period 100. */
export const multipleGasIVg = batch('MultipleGAS_IV_g', gasIVg, 100);
/** `MultipleGAS_IV_h`: GAS_IV_h to period 100. */
export const multipleGasIVh = batch('MultipleGAS_IV_h', gasIVh, 100);
/** `MultipleGAS_IV_i`: GAS_IV_i to period 100. */
export const multipleGasIVi = batch('MultipleGAS_IV_i', gasIVi, 100);

/** Every legacy batch harness of the family. */
export const sugarscapeBatches: readonly SugarscapeBatch[] = [
  multipleGasII2,
  multipleGasIVa,
  multipleGasIVb,
  multipleGasIVc,
  multipleGasIVd,
  multipleGasIVe,
  multipleGasIVf,
  multipleGasIVg,
  multipleGasIVh,
  multipleGasIVi,
] as unknown as readonly SugarscapeBatch[];
