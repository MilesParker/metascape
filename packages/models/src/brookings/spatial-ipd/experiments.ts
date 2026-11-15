// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: name.milesparker.spatialipd.PD2DGAMulti, PD2DGAMultiple, PD2DGAMultipleTo (the batch sweeps).
// Original: Copyright 2000 Miles T. Parker.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles T. Parker and contributors, under EPL-2.0.
import {
  type ExperimentDesign,
  type ExperimentValue,
  range,
  type RootScape,
} from '@metascape/engine';
import { topGenomes, type GaParameters, type GaPlayer } from './spatial-ipd';

type Design = ExperimentDesign<GaParameters>;

/** The end-of-run statistics the legacy data files carried. */
function finalStatistics(root: RootScape<GaParameters>): Record<string, ExperimentValue> {
  const d = root.data;
  return {
    population: root.findScape('Players').size,
    cooperateRatio: d.latest('Cooperate Ratio.sum'),
    defectRatio: d.latest('Defect Ratio.sum'),
    cooperateClosest: d.latest('Cooperate Closest.sum'),
    cooperateFarthest: d.latest('Cooperate Farthest.sum'),
    defectClosest: d.latest('Defect Closest.sum'),
    defectFarthest: d.latest('Defect Farthest.sum'),
  };
}

/**
 * The sweep of `PD2DGAMultiple`: memory size 1 only, 35 runs of 1000 periods, with
 * the final summed ratios as output. Run it on `pd2dgaMultiple`.
 */
export function pd2dgaMultipleDesign(overrides: Partial<Design> = {}): Design {
  return {
    parameters: { memorySize: range(1, 1, 1) },
    replicates: 35,
    maxIterations: 1000,
    measure: finalStatistics,
    ...overrides,
  };
}

/**
 * The sweep of `PD2DGAMultipleTo`: memory size 1 only, 35 runs, each until the
 * population is extinct (the model stops itself) or `maxIterations`. The period at which
 * a run ended is the built-in `periods` column. Run it on `pd2dgaMultipleTo`.
 */
export function pd2dgaMultipleToDesign(overrides: Partial<Design> = {}): Design {
  return {
    parameters: { memorySize: range(1, 1, 1) },
    replicates: 35,
    maxIterations: 10000,
    measure: (root) => ({ population: root.findScape('Players').size }),
    ...overrides,
  };
}

/**
 * The run data of `PD2DGAMulti`: the eight most common genomes of the final
 * population and their counts (`genome0`, `count0`, ...). Run it on `pd2dgaMulti`.
 */
export function pd2dgaMultiDesign(overrides: Partial<Design> = {}, rankSize = 8): Design {
  return {
    parameters: { memorySize: range(1, 1, 1) },
    replicates: 35,
    maxIterations: 1000,
    measure: (root) => {
      const row: Record<string, ExperimentValue> = {};
      const ranked = topGenomes(
        root.findScape('Players') as unknown as Iterable<GaPlayer>,
        rankSize,
      );
      for (let i = 0; i < rankSize; i++) {
        row[`genome${i}`] = ranked[i]?.genome ?? '';
        row[`count${i}`] = ranked[i]?.count ?? 0;
      }
      return row;
    },
    ...overrides,
  };
}
