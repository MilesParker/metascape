// SPDX-License-Identifier: EPL-2.0
//
// The hand-written ports of the examples' method bodies, by example name.
import type { MethodPorts } from '../../src/metaabm';
import { ports as stupidModel5 } from './StupidModel5.ports';

export const examplePorts: Readonly<Record<string, MethodPorts>> = {
  StupidModel5: stupidModel5,
};
