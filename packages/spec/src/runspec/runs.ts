// SPDX-License-Identifier: EPL-2.0
//
// Running a model as a run spec says, and checking a run's results against a
// run test's constraints, as AMP's APar and ATest interpreters and Ascape's
// sweeps did.
import { range, type RootScape, type RunSetup, type StopCondition } from '@metascape/engine';
import type { AttributeRef, Model } from '../metamodel/types';
import { describeConstraint, measureValue } from './measure';
import type { Constraint, RunParameter, RunSpec, RunValue } from './types';

/** Finds a run spec by ID, such as one another incorporates. */
export type RunSpecLookup = (id: string) => RunSpec | undefined;

/** A list of run specs as a {@link RunSpecLookup}. */
export const lookupIn =
  (specs: readonly RunSpec[]): RunSpecLookup =>
  (id) =>
    specs.find((spec) => spec.id === id);

/** A run spec with what it incorporates taken in. */
export interface ResolvedRunSpec {
  readonly stopPeriod?: number;
  readonly stopWhen: readonly Constraint[];
  readonly parameters: readonly RunParameter[];
}

/**
 * Takes in what a run spec incorporates, as AMP's `AParInterpreter.collect`
 * did: first the spec's own settings, then those of the specs it
 * incorporates, last first, each skipping attributes already set. So a spec's
 * own setting wins, and of two incorporated specs the later wins. A link
 * keeps only its members not already set. The stop period and the stop
 * conditions are taken like an attribute each.
 *
 * Throws if a spec incorporates one that the lookup does not have, or itself.
 */
export function resolveRunSpec(
  spec: RunSpec,
  lookup: RunSpecLookup = () => undefined,
): ResolvedRunSpec {
  const set = new Set<string>();
  let stopPeriod: number | undefined;
  let stopWhen: readonly Constraint[] | undefined;
  const parameters: RunParameter[] = [];
  const keep = (parameter: RunParameter): RunParameter | undefined => {
    if (parameter.kind !== 'link') {
      if (set.has(parameter.attribute)) return undefined;
      set.add(parameter.attribute);
      return parameter;
    }
    const members = parameter.parameters.flatMap((member) => keep(member) ?? []);
    return members.length > 0 ? { kind: 'link', parameters: members } : undefined;
  };
  const collect = (current: RunSpec, within: readonly string[]): void => {
    for (const parameter of current.parameters ?? []) {
      const kept = keep(parameter);
      if (kept) parameters.push(kept);
    }
    if (current.stopPeriod !== undefined && stopPeriod === undefined) {
      stopPeriod = current.stopPeriod;
    }
    stopWhen ??= current.stopWhen;
    for (const id of [...(current.incorporates ?? [])].reverse()) {
      if (within.includes(id)) {
        throw new Error(`Run spec ${current.id} incorporates ${id}, which incorporates it`);
      }
      const incorporated = lookup(id);
      if (!incorporated)
        throw new Error(`Run spec ${current.id} incorporates ${id}, which is missing`);
      collect(incorporated, [...within, id]);
    }
  };
  collect(spec, [spec.id]);
  return {
    ...(stopPeriod !== undefined && { stopPeriod }),
    stopWhen: stopWhen ?? [],
    parameters,
  };
}

/** One run of a run spec. */
export interface Run {
  /** The run spec's label (or ID), then the run's number if the spec sweeps. */
  readonly name: string;
  /** Values for the model's parameters, keyed as the interpreter names them (`individualCount`, `city.width`). */
  readonly parameters: Readonly<Record<AttributeRef, RunValue>>;
  readonly stopPeriod?: number;
  readonly stopWhen: readonly Constraint[];
}

/** One dimension of a sweep: the settings of each of its steps. */
type Dimension = readonly (readonly (readonly [AttributeRef, RunValue])[])[];

function dimensionOf(parameter: RunParameter): Dimension {
  switch (parameter.kind) {
    case 'single':
      return [[[parameter.attribute, parameter.value]]];
    case 'sweep':
      return range(parameter.start, parameter.end, parameter.increment).map((value) => [
        [parameter.attribute, value],
      ]);
    case 'link': {
      // Members advance together; one that has run out keeps its last value.
      const members = parameter.parameters.map(dimensionOf);
      if (members.some((member) => member.length === 0)) return [];
      const length = Math.max(0, ...members.map((member) => member.length));
      return Array.from({ length }, (_, step) =>
        members.flatMap((member) => member[Math.min(step, member.length - 1)]!),
      );
    }
  }
}

/**
 * The runs a run spec describes: one, or one per combination of its sweeps'
 * values. Each sweep (or link of sweeps) is crossed with the others, as
 * Ascape's `SweepGroup` did: the first varies slowest and the last fastest.
 * A sweep's values run from its start to its end, both included, without
 * the drift of adding the increment again and again (Ascape added it). A
 * sweep with no values (its increment points away from its end) gives no runs.
 */
export function runsOf(spec: RunSpec, lookup?: RunSpecLookup): Run[] {
  const resolved = resolveRunSpec(spec, lookup);
  const dimensions = resolved.parameters.map(dimensionOf);
  if (dimensions.some((dimension) => dimension.length === 0)) return [];
  let combinations: (readonly (readonly [AttributeRef, RunValue])[])[] = [[]];
  for (const dimension of dimensions) {
    combinations = combinations.flatMap((before) => dimension.map((step) => [...before, ...step]));
  }
  const name = spec.label ?? spec.id;
  return combinations.map((settings, index) => ({
    name: combinations.length > 1 ? `${name} ${index + 1}` : name,
    parameters: Object.fromEntries(settings),
    ...(resolved.stopPeriod !== undefined && { stopPeriod: resolved.stopPeriod }),
    stopWhen: resolved.stopWhen,
  }));
}

/** Stop conditions for the engine, one per constraint: a run stops once one holds. */
export function stopConditions(model: Model, constraints: readonly Constraint[]): StopCondition[] {
  return constraints.map((constraint) => ({
    reason: describeConstraint(model, constraint),
    holds: (root: RootScape) => {
      const value = measureValue(root, model, constraint);
      return value !== undefined && value >= constraint.min && value <= constraint.max;
    },
  }));
}

/** The runs of run specs, as the engine offers them to choose from. */
export function runSetups(
  model: Model,
  specs: readonly RunSpec[],
  lookup: RunSpecLookup = lookupIn(specs),
): RunSetup[] {
  return specs.flatMap((spec) =>
    runsOf(spec, lookup).map((run) => ({
      name: run.name,
      parameters: run.parameters,
      ...(run.stopPeriod !== undefined && { stopPeriod: run.stopPeriod }),
      ...(run.stopWhen.length > 0 && { stopWhen: stopConditions(model, run.stopWhen) }),
    })),
  );
}

/** How a constraint's measure compared with its range. ARes's `Issue`. */
export type Issue = 'none' | 'belowRange' | 'aboveRange' | 'notFound';

/** A constraint checked against a run. ARes's `ConstraintTest`. */
export interface ConstraintResult {
  readonly constraint: Constraint;
  /** The measure's value at the end of the run; NaN if it is not collected. */
  readonly value: number;
  readonly issue: Issue;
}

/**
 * Checks constraints against a run's results as AMP's test runner did: each
 * measure's value in the last period collected, against its range. A measure
 * the run does not collect is `notFound`.
 */
export function checkConstraints(
  root: RootScape,
  model: Model,
  constraints: readonly Constraint[],
): ConstraintResult[] {
  return constraints.map((constraint) => {
    const value = measureValue(root, model, constraint);
    if (value === undefined) return { constraint, value: Number.NaN, issue: 'notFound' };
    const issue: Issue =
      value < constraint.min ? 'belowRange' : value > constraint.max ? 'aboveRange' : 'none';
    return { constraint, value, issue };
  });
}
