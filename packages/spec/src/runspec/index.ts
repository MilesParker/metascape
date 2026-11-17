// SPDX-License-Identifier: EPL-2.0
//
// Run specs and run tests, ported from AMP's APar and ATest (see ./types.ts),
// and curation (../curation/types.ts): typed declarative models beside the
// model format (R24).
export * from '../curation/types';
export { assertNoErrors, checkCuration, checkRunSpec, checkRunTest } from './check';
export {
  agentAt,
  describeConstraint,
  measuredAttributes,
  measurementLabel,
  measureValue,
  parameterAttribute,
  seriesOf,
} from './measure';
export {
  checkConstraints,
  lookupIn,
  resolveRunSpec,
  runSetups,
  runsOf,
  stopConditions,
  type ConstraintResult,
  type Issue,
  type ResolvedRunSpec,
  type Run,
  type RunSpecLookup,
} from './runs';
export {
  curationSchema,
  parseCuration,
  parseRunSpec,
  parseRunTest,
  runSpecSchema,
  runTestSchema,
} from './schema';
export * from './types';
