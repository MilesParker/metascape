// SPDX-License-Identifier: EPL-2.0
import { type Curation, type RunSpec } from '@metascape/spec';
import { defineFamily } from '../../catalog';
import { fromMetaabm as fromFormat } from '../../format-model';
import modelOneSource from './ClassesModelOne.model.json';
import {
  classesFigure2,
  classesFigure3,
  classesFigure6,
  classesFigure7,
  classesFigure8,
  classesFigure9,
  classesModelOne,
  classesModelTwo,
  classesPeyton,
} from './models';

/** The format version's chart: the coded models' demands in the latest encounter. */
const curation: Curation = {
  schemaVersion: 1,
  model: 'classes',
  charts: [
    {
      title: 'Demands in the latest encounter',
      series: (['low', 'medium', 'high'] as const).map((level) => ({
        measure: 'count' as const,
        agent: 'bargainer',
        attribute: 'demand',
        qualifier: level,
        label: level[0]!.toUpperCase() + level.slice(1),
      })),
      yMin: 0,
    },
  ],
};

/** The paper's figures 2 and 3, which are settings of Model One. */
const runSpecs: RunSpec[] = [
  {
    schemaVersion: 1,
    id: 'figure2',
    label: 'Figure 2',
    model: 'classes',
    parameters: [
      { kind: 'single', attribute: 'minimumMemorySize', value: 20 },
      { kind: 'single', attribute: 'maximumMemorySize', value: 20 },
    ],
  },
  {
    schemaVersion: 1,
    id: 'figure3',
    label: 'Figure 3',
    model: 'classes',
    incorporates: ['figure2'],
    parameters: [{ kind: 'single', attribute: 'highLowStart', value: true }],
  },
];

/**
 * Model One written in the model format (a pilot, beside the coded port):
 * each memory is an agent nested in its bargainer.
 */
export const classesModelOneFormat = fromFormat(modelOneSource, {
  name: 'Emergence of Classes: Model One (format)',
  provenance: {
    ...classesModelOne.provenance!,
    note: 'Written in the model format from the coded port. Each memory is an agent held by its bargainer; there is no simplex view. Figures 2 and 3 are its runs.',
  },
  curation,
  runSpecs,
});

export {
  classesFigure2,
  classesFigure3,
  classesFigure6,
  classesFigure7,
  classesFigure8,
  classesFigure9,
  classesModelOne,
  classesModelTwo,
  classesPeyton,
};

/** The Emergence of Classes bargaining model of Axtell, Epstein and Young. */
export const family = defineFamily({
  id: 'brookings-classes',
  name: 'Emergence of Classes',
  collection: 'Brookings Institution models (from Ascape)',
  tags: ['game theory', 'economics'],
  description:
    'A multi-agent bargaining model in which conventions about fair shares, and between tagged groups unequal shares, emerge from local encounters.',
  models: [
    classesModelOne,
    classesModelOneFormat,
    classesFigure2,
    classesFigure3,
    classesModelTwo,
    classesFigure6,
    classesFigure7,
    classesFigure8,
    classesFigure9,
    classesPeyton,
  ],
});
