// SPDX-License-Identifier: EPL-2.0
import { defineFamily } from '../../catalog';
import {
  cvModel,
  cvModelI,
  cvModelIRun1,
  cvModelIRun2,
  cvModelIRun3,
  cvModelIRun3and4and5,
  cvModelIRun4,
  cvModelIRun5,
} from './model-i';
import {
  cvModelII,
  cvModelIIRun1,
  cvModelIIRun2and3,
  cvModelIIRun4aandb,
  cvModelInterGroup,
  cvModelInterGroupRetr,
} from './model-ii';

export {
  cvModel,
  cvModelI,
  cvModelIRun1,
  cvModelIRun2,
  cvModelIRun3,
  cvModelIRun3and4and5,
  cvModelIRun4,
  cvModelIRun5,
  cvModelII,
  cvModelIIRun1,
  cvModelIIRun2and3,
  cvModelIIRun4aandb,
  cvModelInterGroup,
  cvModelInterGroupRetr,
};

/** The Civil Violence models, Model I first, then Model II. */
export const family = defineFamily({
  id: 'brookings-civil-violence',
  name: 'Civil Violence',
  collection: 'Brookings Institution models (from Ascape)',
  description:
    "Joshua Epstein's civil violence models: rebellion against a central authority (Model I) and violence between two groups with cops as peacekeepers (Model II), with the runs of the paper.",
  models: [
    cvModel,
    cvModelI,
    cvModelIRun1,
    cvModelIRun2,
    cvModelIRun3and4and5,
    cvModelIRun3,
    cvModelIRun4,
    cvModelIRun5,
    cvModelInterGroup,
    cvModelInterGroupRetr,
    cvModelII,
    cvModelIIRun1,
    cvModelIIRun2and3,
    cvModelIIRun4aandb,
  ],
});
