// SPDX-License-Identifier: EPL-2.0
//
// Run specs and run tests: how a model is run, and what its results should
// be. They are ported from the run metamodels of the Eclipse Agent Modeling
// Platform (AMP): APar (`org.eclipse.amp.amf.parameters`, `APar.xtext`), which
// set and swept a model's attributes for a run, and ATest
// (`org.eclipse.amp.amf.testing`, `ATest.ecore`), which stated constraints on
// a run's results. They sit beside the model format and refer into a model;
// the mapping, and every departure from AMP, is described in
// docs/metamodel-review.md (R24).

import type {
  AgentId,
  AgentRef,
  AttributeId,
  AttributeRef,
  Id,
  OptionId,
} from '../metamodel/types';

/** The version of the run spec and run test formats described here. */
export const RUN_SPEC_SCHEMA_VERSION = 1;

// ──────────────────────────── Run specs (APar) ────────────────────────────

/** A value given to an attribute: ABase's `Value` (an integer, real, string or boolean). */
export type RunValue = boolean | number | string;

/** One attribute set to one value. APar's `SingleParameter`. */
export interface SingleParameter {
  kind: 'single';
  /**
   * The attribute: one of the model's parameters, an attribute of the root
   * scape (`individualCount`) or of one of its spaces (`city.width`).
   */
  attribute: AttributeRef;
  /** For a state attribute, the ID of an option. */
  value: RunValue;
}

/**
 * An attribute taking each value from `start` to `end`, both included, in
 * steps of `increment`, one run each. APar's `SweepParameter`.
 */
export interface SweepParameter {
  kind: 'sweep';
  attribute: AttributeRef;
  start: number;
  end: number;
  increment: number;
}

/**
 * Parameters that advance together instead of being crossed: the first
 * values of each, then the second, and so on. One that has no more values
 * keeps its last. APar's `SweepLink` (Ascape's `SweepLink`).
 */
export interface SweepLink {
  kind: 'link';
  parameters: RunParameter[];
}

/** APar's `Parameter`. */
export type RunParameter = SingleParameter | SweepParameter | SweepLink;

/**
 * How a model is run: values for its parameters, sweeps over them, and when
 * a run stops. APar's `Model`.
 */
export interface RunSpec {
  schemaVersion: typeof RUN_SPEC_SCHEMA_VERSION;
  /** The run spec's ID. In AMP, its file name (`EpiBase.apar` is `EpiBase`). */
  id: Id;
  /** Display name. APar's `name`. Default: the ID. */
  label?: string | undefined;
  /** The ID of the model it runs (the model's root scape). */
  model: AgentId;
  /**
   * Run specs whose settings this one takes, by ID. Its own settings come
   * first; of those it incorporates, a later one's settings win over an
   * earlier one's. APar's `incorporates`.
   */
  incorporates?: Id[] | undefined;
  /**
   * The period a run stops at. In AMP, the engine's `Stop Period` attribute
   * (Ascape's `Runner.stopPeriod`), set like a parameter.
   */
  stopPeriod?: number | undefined;
  /**
   * _Proposed_ (R24): conditions on the results that stop a run at the end of
   * the first period in which one of them holds, shaped like ATest
   * constraints. Not in AMP.
   */
  stopWhen?: Constraint[] | undefined;
  /** In order. Sweeps and links cross with each other, the first varying slowest. */
  parameters?: RunParameter[] | undefined;
}

// ──────────────────────────── Run tests (ATest) ────────────────────────────

/** A statistic of an attribute over a population. ATest's `Measure`. */
export type Measure = 'count' | 'average' | 'sum' | 'minimum' | 'maximum';

/**
 * A measure of an agent's attribute over every agent of its type, such as the
 * number of individuals whose status is dead (`Count(Individual.Status=Dead)`
 * in ATest). What a constraint is of, and what a chart's series are.
 */
export interface Measurement {
  measure: Measure;
  /** The agent type measured, by its path from the root scape. */
  agent: AgentRef;
  /**
   * The ID of the measured attribute of that agent. Without one, the measure
   * is `count`: the number of agents.
   */
  attribute?: AttributeId | undefined;
  /**
   * With `count`: of a state attribute, the option counted; of a boolean
   * attribute, the value counted (default `true`). ATest's qualifier is an
   * option only.
   */
  qualifier?: OptionId | boolean | undefined;
}

/**
 * A measure of a run's results that should lie between `min` and `max`, both
 * included. ATest's `Constraint`.
 */
export interface Constraint extends Measurement {
  min: number;
  max: number;
}

/**
 * Constraints a run's results should meet at its end, or a suite of other
 * tests. ATest's `Model`.
 */
export interface RunTest {
  schemaVersion: typeof RUN_SPEC_SCHEMA_VERSION;
  /** The test's ID. In AMP, its file name. */
  id: Id;
  /** Display name. ATest's `name`. */
  label?: string | undefined;
  description?: string | undefined;
  /** The run spec the test runs, by ID. ATest's `tests`; required with constraints. */
  runSpec?: Id | undefined;
  constraints?: Constraint[] | undefined;
  /** The tests this suite holds, by ID. ATest's `contains`. */
  contains?: Id[] | undefined;
}
