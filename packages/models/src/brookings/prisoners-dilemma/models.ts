// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.pd.PD2D, PD2DCellular, PD2DDemo, PD2DSmallWorld, Player.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles T. Parker and contributors, under EPL-2.0.
import { defineModel, type Provenance } from '@metascape/engine';
import { buildDemographicPd, pdParameters } from './demographic-pd';

const BROOKINGS =
  'Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.';

function provenance(legacyClass: string, note: string): Provenance {
  return {
    authors: 'Joshua M. Epstein',
    citation:
      "Epstein, J. M. (1998). Zones of cooperation in demographic prisoner's dilemma. Complexity, 4(2), 36-48.",
    portedFrom: `Ascape 5.6.1, edu.brook.pd.${legacyClass}`,
    copyright: BROOKINGS,
    note,
  };
}

const DESCRIPTION =
  "Epstein's demographic Prisoner's Dilemma: tagless players with a fixed, inherited cooperate-or-defect strategy move to random sites on a lattice and play their neighbors. Payoffs accumulate, rich players clone onto neighboring sites, players with negative wealth die, and zones of cooperation emerge.";

const parameters = pdParameters({ latticeWidth: 20, latticeHeight: 20 });

/** `edu.brook.pd.PD2D`: a 20 x 20 von Neumann torus. */
export const pd2d = defineModel({
  name: 'Demographic PD: PD2D',
  description: DESCRIPTION,
  provenance: provenance(
    'PD2D',
    'The statistics of the legacy chart are recorded on the live population.',
  ),
  parameters,
  build: (sim) => buildDemographicPd(sim, { lattice: 'vonNeumann', ageStats: true }),
});

/**
 * `edu.brook.pd.PD2DSmallWorld`: its small-world lattice line is commented
 * out in the legacy source, so it is PD2D with a rebuilt (still von Neumann) lattice.
 */
export const pd2dSmallWorld = defineModel({
  name: 'Demographic PD: PD2DSmallWorld',
  description: `${DESCRIPTION} (In the legacy source this variant still uses the von Neumann lattice.)`,
  provenance: provenance(
    'PD2DSmallWorld',
    'The legacy small-world lattice is commented out, so the rules and lattice equal PD2D.',
  ),
  parameters,
  build: (sim) => buildDemographicPd(sim, { lattice: 'vonNeumann', ageStats: true }),
});

/**
 * `edu.brook.pd.PD2DCellular`: the lattice is Ascape's default
 * `Array2DSmallWorld`, which is a bounded Moore lattice without rewired links.
 */
export const pd2dCellular = defineModel({
  name: 'Demographic PD: PD2DCellular',
  description: `${DESCRIPTION} This variant plays on a bounded 8-neighbor (Moore) lattice.`,
  provenance: provenance(
    'PD2DCellular',
    'Neighbors follow Array2DSmallWorld with its defaults: Moore radius 1, no random edges, non-periodic edges.',
  ),
  parameters,
  build: (sim) => buildDemographicPd(sim, { lattice: 'smallWorld', ageStats: true }),
});

/**
 * `edu.brook.pd.PD2DDemo`: the same game on a 30 x 30 torus with fewer
 * statistics. The legacy class cannot run (see the README); this is the
 * intended model.
 */
export const pd2dDemo = defineModel({
  name: 'Demographic PD: PD2DDemo',
  description: DESCRIPTION,
  provenance: provenance(
    'PD2DDemo',
    'The legacy class throws a ClassCastException when run (Player casts its root to PD2D); ported as intended, on a 30 x 30 lattice.',
  ),
  parameters: pdParameters({ latticeWidth: 30, latticeHeight: 30 }),
  build: (sim) => buildDemographicPd(sim, { lattice: 'vonNeumann', ageStats: false }),
});
