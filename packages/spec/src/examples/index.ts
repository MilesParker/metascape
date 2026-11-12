// SPDX-License-Identifier: EPL-2.0
import type { ModelSpec } from '../schema';
import { epidemic } from './epidemic';
import { forager } from './forager';
import { life } from './life';
import { pursuit } from './pursuit';
import { schelling } from './schelling';

export { epidemic, forager, life, pursuit, schelling };

/** Every example model, keyed by a short name. */
export const exampleSpecs: Readonly<Record<string, ModelSpec>> = {
  life,
  schelling,
  epidemic,
  forager,
  pursuit,
};
