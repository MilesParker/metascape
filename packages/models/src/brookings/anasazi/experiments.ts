// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.aa.LHVRMS, LHVTest (sweep and run statistics).
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.

/**
 * The calibration harnesses of the legacy package, expressed as experiment
 * designs for {@link lhv}. `LHVRMS` and `LHVTest` were not models of their
 * own but `LHV` run under a parameter sweep that wrote run statistics to a
 * file. Run them with `experimentRuns(lhv, lhvRmsExperiment)`.
 */
import { type ExperimentDesign, range, type RootScape } from '@metascape/engine';
import { lhv } from './lhv';

type LhvSchema = (typeof lhv)['parameters'];

/** The parameter grid shared by both harnesses: four linked dimensions, crossed. */
const SWEEP = {
  minFertilityAge: range(13, 16, 1),
  maxFertilityAge: range(19, 16, -1),
  minFertilityEndsAge: range(26, 30, 1),
  maxFertilityEndsAge: range(34, 30, -1),
  minFertility: range(0.09, 0.1251, 0.0025),
  maxFertility: range(0.16, 0.1249, -0.0025),
  minDeathAge: range(26, 30, 1),
  maxDeathAge: range(34, 30, -1),
} as const;

const LINKED = [
  ['minFertilityAge', 'maxFertilityAge'],
  ['minFertilityEndsAge', 'maxFertilityEndsAge'],
  ['minFertility', 'maxFertility'],
  ['minDeathAge', 'maxDeathAge'],
] as const;

/** Periods from the default start year 800 to the stop year 1350. */
const RUN_TICKS = 550;

/** Summary of the modelled-minus-historic household difference over a run. */
export interface DifferenceSummary {
  readonly minimumDifference: number;
  readonly maximumDifference: number;
  readonly averageDifference: number;
  /** Root mean square of the difference (`LHVRMS`'s "RMS" column). */
  readonly rms: number;
}

/** Summarises the recorded `difference` series of a run, every sample from period 0 on. */
export function summarizeDifference(root: RootScape): DifferenceSummary {
  const values = root.data.values('difference');
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  let sumSquares = 0;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
    sumSquares += value * value;
  }
  const n = values.length;
  return {
    minimumDifference: min,
    maximumDifference: max,
    averageDifference: sum / n,
    rms: Math.sqrt(sumSquares / n),
  };
}

/**
 * `LHVRMS`: the sweep (4 x 5 x 15 x 5 = 1500 points, 3 runs each) recording
 * the minimum, maximum and average difference between modelled and
 * historic households and its root mean square. As in the legacy harness, a
 * run is abandoned once, before AD 1000, the model exceeds the record
 * by more than 300 households.
 */
export const lhvRmsExperiment: ExperimentDesign<LhvSchema> = {
  parameters: SWEEP,
  linked: LINKED,
  replicates: 3,
  maxIterations: RUN_TICKS,
  prepare(root) {
    root.addScapeListener({
      scapeIterated: () => {
        const year = root.data.latest('year');
        if (year < 1000 && root.data.latest('difference') > 300) {
          root.stop('difference above 300 before AD 1000');
        }
      },
    });
  },
  measure(root) {
    return { ...summarizeDifference(root as unknown as RootScape) };
  },
};

/**
 * `LHVTest`: the same sweep with 5 runs per point. The legacy harness wrote
 * every statistic of every year to a file; here each run reports its final
 * modelled and historic household counts and the difference summary. Its
 * extra series, misnamed "Difference Squared", was the number of extant
 * historic settlements, reported here as `historicSettlements`.
 */
export const lhvTestExperiment: ExperimentDesign<LhvSchema> = {
  parameters: SWEEP,
  linked: LINKED,
  replicates: 5,
  maxIterations: RUN_TICKS,
  measure(root) {
    return {
      households: root.data.latest('households'),
      historicHouseholds: root.data.latest('historicHouseholds'),
      historicSettlements: root.data.latest('historicSettlements'),
      ...summarizeDifference(root as unknown as RootScape),
    };
  },
};
