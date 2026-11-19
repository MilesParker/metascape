// SPDX-License-Identifier: EPL-2.0
import type { Curation } from '@metascape/spec';
import { fromMetaabm as fromFormat } from '../format-model';
import { life } from './life';
import source from './Life.model.json';

/** The coded model's chart: the live cells. */
const curation: Curation = {
  schemaVersion: 1,
  model: 'life',
  charts: [
    {
      title: 'Live cells',
      series: [{ measure: 'count', agent: 'cell', attribute: 'on', label: 'Live cells' }],
      yMin: 0,
    },
  ],
};

/**
 * Conway's Life written in the model format, beside the coded one. The starting patterns are in
 * the model, and the explorations are the coded model's, with the R-pentomino's option spelled as
 * the format has it. Periodic is an attribute of the lattice, which sets its border rule.
 */
export const lifeFormat = fromFormat(source, {
  name: 'Game of Life (format)',
  provenance: {
    ...life.provenance,
    note: 'Written in the model format from the coded model. Periodic is an attribute of the lattice, which sets its border rule, as the width and the height are.',
  },
  curation,
});

// Studio's descriptions of a catalogue model that the format does not carry in the model itself.
Object.assign(lifeFormat, {
  ...(life.summary !== undefined && { summary: life.summary }),
  ...(life.tags !== undefined && { tags: life.tags }),
  explorations: life.explorations?.map((exploration) => ({
    ...exploration,
    parameters: Object.fromEntries(
      Object.entries(exploration.parameters ?? {}).map(([key, value]) => [
        key.replace(/^(width|height|periodic)$/, 'world.$1'),
        value === 'r-pentomino' ? 'rPentomino' : value,
      ]),
    ),
  })),
});
