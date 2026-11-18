// SPDX-License-Identifier: EPL-2.0 AND BSD-3-Clause
//
// Sugarscape II-1, II-2 and II-3 written in the model format (`*.model.json`), beside the coded
// ports of the same classes. See docs/format-pilot/sugarscape.md. II-1 is a whole model; II-2 is an
// overlay of it (the growback rule differs) and II-3 an overlay of II-2 (a name and a description),
// as the Java classes extended each other. They are resolved into flat models before they are checked.
//
// Ported to Metascape from Ascape 5.6.1: edu.brook.sugarscape.GAS_II_1, GAS_II_2, GAS_II_3.
// Original: Copyright 1998-2007 The Brookings Institution, with revisions by Metascape LLC, and others.
// All rights reserved. Used under the BSD license in LICENSES/brookings-models-license.txt.
// This port: Copyright (c) 2026 Miles Parker and contributors, under EPL-2.0.
import type { Curation } from '@metascape/spec';
import { fromMetaabm } from '../../format-model';
import { sugarscapeProvenance } from './base';
import II1 from './SugarscapeII1.model.json';
import II2 from './SugarscapeII2.model.json';
import II3 from './SugarscapeII3.model.json';

/** What to look at, as the coded models' charts: the population, and the means of the traits. */
function curation(model: string): Curation {
  return {
    schemaVersion: 1,
    model,
    charts: [
      {
        title: 'Population',
        series: [{ measure: 'count', agent: 'sugarAgent', label: 'Population' }],
      },
      {
        title: 'Mean sugar, vision and metabolism',
        series: [
          { measure: 'average', agent: 'sugarAgent', attribute: 'sugar', label: 'Sugar' },
          { measure: 'average', agent: 'sugarAgent', attribute: 'vision', label: 'Vision' },
          {
            measure: 'average',
            agent: 'sugarAgent',
            attribute: 'sugarMetabolism',
            label: 'Sugar metabolism',
          },
        ],
      },
    ],
  };
}

/** The files an overlay may name as its base, by model ID. */
const files = [II1, II2, II3];

const note =
  'Written in the model format and run by the interpreter; see the coded port beside it.';

export const gasII1Format = fromMetaabm(II1, {
  name: 'Sugarscape II-1: Immediate growback (format)',
  provenance: sugarscapeProvenance('GAS_II_1', note),
  curation: curation('sugarscapeII1'),
});

export const gasII2Format = fromMetaabm(II2, {
  name: 'Sugarscape II-2: Unit growback (format)',
  provenance: sugarscapeProvenance('GAS_II_2', note),
  curation: curation('sugarscapeII2'),
  bases: files,
});

export const gasII3Format = fromMetaabm(II3, {
  name: 'Sugarscape II-3: Carrying capacity (format)',
  provenance: sugarscapeProvenance(
    'GAS_II_3',
    `${note} Same rules as GAS_II_2; the legacy class only adds the population chart.`,
  ),
  curation: curation('sugarscapeII3'),
  bases: files,
});
