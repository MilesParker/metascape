// SPDX-License-Identifier: EPL-2.0
import { defineFamily } from '../../catalog';
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
  description:
    'A multi-agent bargaining model in which conventions about fair shares, and between tagged groups unequal shares, emerge from local encounters.',
  models: [
    classesModelOne,
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
