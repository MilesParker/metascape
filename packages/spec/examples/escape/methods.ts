// SPDX-License-Identifier: EPL-2.0
//
// The hand-written implementations of the examples' method acts, by example name.
import type { MethodImplementations } from '../../src/metamodel/method';
import { methods as stupidModel5 } from './StupidModel5.methods';

export const exampleMethods: Readonly<Record<string, MethodImplementations>> = {
  StupidModel5: stupidModel5,
};
