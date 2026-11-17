// SPDX-License-Identifier: EPL-2.0
//
// Example models written by hand in the model format.
import type { Model } from '../types';
import { forager } from './forager';
import { life } from './life';
import { schelling } from './schelling';
import { stupidModel1 } from './stupid-model-1';

export { forager, life, schelling, stupidModel1 };

/** The examples written for Metascape, keyed by a short name. */
export const examples: Readonly<Record<string, Model>> = { life, schelling, forager };
