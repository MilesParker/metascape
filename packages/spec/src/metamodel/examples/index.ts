// SPDX-License-Identifier: EPL-2.0
//
// Example models written by hand in the model format.
import type { RunSpec } from '../../runspec/types';
import type { Model } from '../types';
import { forager, foragerRun } from './forager';
import { life } from './life';
import { schelling, schellingRun } from './schelling';
import { stupidModel1 } from './stupid-model-1';

export { forager, foragerRun, life, schelling, schellingRun, stupidModel1 };

/** The examples written for Metascape, keyed by a short name. */
export const examples: Readonly<Record<string, Model>> = { life, schelling, forager };

/** The run spec each example runs by, where it has one, by the example's short name. */
export const exampleRuns: Readonly<Record<string, RunSpec>> = {
  schelling: schellingRun,
  forager: foragerRun,
};
