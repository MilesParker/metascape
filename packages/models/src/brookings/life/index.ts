// SPDX-License-Identifier: EPL-2.0
import type { Curation } from '@metascape/spec';
import { defineFamily } from '../../catalog';
import { fromMetaabm as fromFormat } from '../../amp/metaabm';
import conwayLifeSource from './ConwayLife.model.json';
import conwayLifeSmallWorldSource from './ConwayLifeSmallWorld.model.json';
import smallConwayLifeSource from './SmallConwayLife.model.json';
import { lifeProvenance } from './life-cell';
import { conwayLife, conwayLifeSmallWorld, smallConwayLife } from './life-models';

export { conwayLife, conwayLifeSmallWorld, smallConwayLife };

/** The coded models' chart: the cells alive. */
const curation = (model: string): Curation => ({
  schemaVersion: 1,
  model,
  charts: [
    {
      title: 'Live cells',
      series: [{ measure: 'count', agent: 'cell', attribute: 'on', label: 'Alive' }],
      yMin: 0,
    },
  ],
});

const note = 'Written in the model format from the coded port; see the coded model beside it.';

/** Life on a 51 by 51 torus, written in the model format. */
export const conwayLifeFormat = fromFormat(conwayLifeSource, {
  name: "Conway's Life: ConwayLife (format)",
  provenance: lifeProvenance('ConwayLife', note),
  curation: curation('conwayLife'),
});

/** Life on a 60 by 60 lattice with edges, written in the model format (without the port's rewiring). */
export const conwayLifeSmallWorldFormat = fromFormat(conwayLifeSmallWorldSource, {
  name: "Conway's Life: ConwayLifeSmallWorld (format)",
  provenance: lifeProvenance(
    'ConwayLifeSmallWorld',
    `${note} The port's radius and random edge ratio, which the legacy model does not expose, are left out: rewiring needs a small-world network generator, which the format lacks.`,
  ),
  curation: curation('conwayLifeSmallWorld'),
});

/** The condensed Life with its kept quirk, written in the model format. */
export const smallConwayLifeFormat = fromFormat(smallConwayLifeSource, {
  name: "Conway's Life: SmallConwayLife (format)",
  provenance: lifeProvenance(
    'SmallConwayLife',
    `${note} The legacy quirk is kept: in the first step every initially live cell dies.`,
  ),
  curation: curation('smallConwayLife'),
});

/** The Brookings Life models. */
export const family = defineFamily({
  id: 'brookings-life',
  name: "Conway's Life",
  collection: 'Brookings Institution models (from Ascape)',
  tags: ['cellular automata'],
  description:
    "John Conway's cellular automaton in three Ascape forms: the full model, a small-world neighborhood variant and a condensed version.",
  models: [
    smallConwayLife,
    smallConwayLifeFormat,
    conwayLife,
    conwayLifeFormat,
    conwayLifeSmallWorld,
    conwayLifeSmallWorldFormat,
  ],
});
