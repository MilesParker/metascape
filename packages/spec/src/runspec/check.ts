// SPDX-License-Identifier: EPL-2.0
//
// The checkers for run specs, run tests and curation: that their references
// resolve against a model, and that their values fit.
import { range } from '@metascape/engine';
import type { Curation } from '../curation/types';
import { ModelFormatError } from '../metamodel/schema';
import type { Diagnostic, Model } from '../metamodel/types';
import { agentAt, measuredAttribute, parameterAttribute, seriesOf } from './measure';
import type { RunSpecLookup } from './runs';
import { parseCuration, parseRunSpec, parseRunTest } from './schema';
import type { Constraint, Measurement, RunParameter, RunSpec, RunTest, RunValue } from './types';

type Report = (path: string, severity: Diagnostic['severity'], message: string) => void;

function structure(parse: () => unknown): Diagnostic[] | undefined {
  try {
    parse();
    return undefined;
  } catch (error) {
    if (error instanceof ModelFormatError) return [...error.diagnostics];
    throw error;
  }
}

function checkModelId(id: string, model: Model, report: Report): void {
  if (id !== model.id)
    report('model', 'error', `Is about the model \`${id}\`, not \`${model.id}\``);
}

/**
 * Checks a measurement: its agent and attribute exist, the measure suits the
 * attribute, a qualifier is one of the attribute's values, and the run
 * records it (`recorded`: needed where its series is drawn or read).
 */
function checkMeasurement(
  model: Model,
  m: Measurement,
  path: string,
  report: Report,
  options: { readonly chart?: boolean } = {},
): void {
  let wrong = false;
  const outer = report;
  report = (at, severity, message) => {
    if (severity === 'error') wrong = true;
    outer(at, severity, message);
  };
  const agent = agentAt(model, m.agent);
  if (!agent) {
    report(`${path}.agent`, 'error', `The model has no agent \`${m.agent}\``);
    return;
  }
  if (m.attribute === undefined) {
    if (m.measure !== 'count')
      report(`${path}.measure`, 'error', `${m.measure} needs an attribute`);
    if (m.qualifier !== undefined)
      report(`${path}.qualifier`, 'error', 'A qualifier needs an attribute');
  } else {
    const attribute = measuredAttribute(model, m);
    if (!attribute) {
      report(`${path}.attribute`, 'error', `\`${m.agent}\` has no attribute \`${m.attribute}\``);
      return;
    }
    const numeric = attribute.type === 'integer' || attribute.type === 'real';
    if (m.measure !== 'count' && !numeric) {
      report(`${path}.measure`, 'error', `${m.measure} needs a numeric attribute`);
    }
    if (m.qualifier !== undefined) {
      if (m.measure !== 'count') {
        report(`${path}.qualifier`, 'error', 'Only a count takes a qualifier');
      } else if (attribute.type === 'state') {
        if (typeof m.qualifier !== 'string' || !attribute.options[m.qualifier]) {
          report(
            `${path}.qualifier`,
            'error',
            `\`${m.attribute}\` has no option \`${String(m.qualifier)}\``,
          );
        }
      } else if (attribute.type === 'boolean') {
        if (typeof m.qualifier !== 'boolean') {
          report(`${path}.qualifier`, 'error', 'The qualifier of a boolean is true or false');
        }
      } else {
        report(`${path}.qualifier`, 'error', 'Only a state or boolean attribute takes a qualifier');
      }
    } else if (m.measure === 'count' && attribute.type === 'state') {
      report(`${path}.qualifier`, 'error', 'A count of a state attribute names the option counted');
    }
  }
  if (wrong) return;
  const series = seriesOf(model, m);
  if (!series) {
    report(
      path,
      'warning',
      m.agent.includes('.')
        ? 'Not recorded: statistics are collected for the agents of the root scape only'
        : 'Not recorded: the cells of a grid are not counted',
    );
  } else if (options.chart && !('id' in series)) {
    report(`${path}.qualifier`, 'error', 'A chart can show only the count of true values');
  }
}

function checkConstraint(model: Model, c: Constraint, path: string, report: Report): void {
  checkMeasurement(model, c, path, report);
  if (c.min > c.max) report(path, 'warning', 'Its minimum is above its maximum, so it never holds');
}

function valueFits(model: Model, ref: string, value: RunValue): string | undefined {
  const attribute = parameterAttribute(model, ref)!;
  switch (attribute.type) {
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value) ? undefined : 'an integer';
    case 'real':
      return typeof value === 'number' ? undefined : 'a number';
    case 'boolean':
      return typeof value === 'boolean' ? undefined : 'true or false';
    case 'symbol':
      return typeof value === 'string' ? undefined : 'a string';
    case 'state':
      return typeof value === 'string' && attribute.options[value]
        ? undefined
        : `one of ${Object.keys(attribute.options).join(', ')}`;
  }
}

function checkParameter(
  model: Model,
  parameter: RunParameter,
  path: string,
  seen: Set<string>,
  report: Report,
): void {
  if (parameter.kind === 'link') {
    if (parameter.parameters.length === 0) report(path, 'warning', 'The link is empty');
    parameter.parameters.forEach((member, i) =>
      checkParameter(model, member, `${path}.parameters[${i}]`, seen, report),
    );
    return;
  }
  const ref = parameter.attribute;
  const attribute = parameterAttribute(model, ref);
  if (!attribute) {
    report(
      `${path}.attribute`,
      'error',
      `\`${ref}\` is not a parameter: an attribute of the root scape or of one of its spaces`,
    );
    return;
  }
  if (attribute.immutable || attribute.derived) {
    report(
      `${path}.attribute`,
      'error',
      `\`${ref}\` is ${attribute.immutable ? 'immutable' : 'derived'}`,
    );
  }
  if (seen.has(ref))
    report(`${path}.attribute`, 'warning', `\`${ref}\` is set more than once; the first is used`);
  seen.add(ref);
  if (parameter.kind === 'single') {
    const expected = valueFits(model, ref, parameter.value);
    if (expected) report(`${path}.value`, 'error', `\`${ref}\` takes ${expected}`);
    return;
  }
  if (attribute.type !== 'integer' && attribute.type !== 'real') {
    report(`${path}.attribute`, 'error', `\`${ref}\` is not numeric, so it cannot be swept`);
    return;
  }
  if (attribute.type === 'integer') {
    for (const key of ['start', 'end', 'increment'] as const) {
      if (!Number.isInteger(parameter[key]))
        report(`${path}.${key}`, 'error', `\`${ref}\` takes an integer`);
    }
  }
  if (range(parameter.start, parameter.end, parameter.increment).length === 0) {
    report(path, 'error', 'The sweep has no values: its increment points away from its end');
  }
}

/**
 * Checks a run spec against the model it runs: that it is about that model,
 * that what it incorporates exists (if a lookup is given) without a cycle,
 * that every attribute it sets is a parameter of the model and every value
 * fits, and that its stop conditions measure what the model has.
 */
export function checkRunSpec(spec: RunSpec, model: Model, lookup?: RunSpecLookup): Diagnostic[] {
  const structural = structure(() => parseRunSpec(spec));
  if (structural) return structural;
  const diagnostics: Diagnostic[] = [];
  const report: Report = (path, severity, message) => diagnostics.push({ path, severity, message });
  checkModelId(spec.model, model, report);
  if (lookup) {
    const visit = (current: RunSpec, within: readonly string[], path: string): void => {
      (current.incorporates ?? []).forEach((id, i) => {
        const at = current === spec ? `incorporates[${i}]` : path;
        if (within.includes(id)) {
          report(at, 'error', `\`${id}\` incorporates \`${current.id}\` in turn`);
          return;
        }
        const incorporated = lookup(id);
        if (!incorporated) report(at, 'error', `There is no run spec \`${id}\``);
        else {
          if (incorporated.model !== spec.model) {
            report(at, 'error', `\`${id}\` runs another model, \`${incorporated.model}\``);
          }
          visit(incorporated, [...within, id], at);
        }
      });
    };
    visit(spec, [spec.id], '');
  }
  const seen = new Set<string>();
  (spec.parameters ?? []).forEach((parameter, i) =>
    checkParameter(model, parameter, `parameters[${i}]`, seen, report),
  );
  (spec.stopWhen ?? []).forEach((c, i) => checkConstraint(model, c, `stopWhen[${i}]`, report));
  return diagnostics;
}

/**
 * Checks a run test against the model its run spec runs: that a test with
 * constraints names a run spec (one the lookup has, about that model) and
 * that every constraint measures what the model has.
 */
export function checkRunTest(test: RunTest, model: Model, lookup?: RunSpecLookup): Diagnostic[] {
  const structural = structure(() => parseRunTest(test));
  if (structural) return structural;
  const diagnostics: Diagnostic[] = [];
  const report: Report = (path, severity, message) => diagnostics.push({ path, severity, message });
  const constraints = test.constraints ?? [];
  if (constraints.length > 0 && test.contains !== undefined) {
    report('contains', 'error', 'A test holds constraints or other tests, not both');
  }
  if (constraints.length > 0 && test.runSpec === undefined) {
    report('runSpec', 'error', 'A test with constraints names the run spec it runs');
  }
  if (test.runSpec !== undefined && lookup) {
    const spec = lookup(test.runSpec);
    if (!spec) report('runSpec', 'error', `There is no run spec \`${test.runSpec}\``);
    else
      checkModelId(spec.model, model, (_, severity, message) =>
        report('runSpec', severity, message),
      );
  }
  constraints.forEach((c, i) => checkConstraint(model, c, `constraints[${i}]`, report));
  return diagnostics;
}

/** Checks a curation against its model: that every measure and series measures what the model has. */
export function checkCuration(curation: Curation, model: Model): Diagnostic[] {
  const structural = structure(() => parseCuration(curation));
  if (structural) return structural;
  const diagnostics: Diagnostic[] = [];
  const report: Report = (path, severity, message) => diagnostics.push({ path, severity, message });
  checkModelId(curation.model, model, report);
  (curation.measures ?? []).forEach((m, i) => checkMeasurement(model, m, `measures[${i}]`, report));
  (curation.charts ?? []).forEach((chart, i) =>
    chart.series.forEach((m, j) =>
      checkMeasurement(model, m, `charts[${i}].series[${j}]`, report, { chart: true }),
    ),
  );
  return diagnostics;
}

/** Throws a `ModelFormatError` listing the errors in diagnostics, if there are any. */
export function assertNoErrors(diagnostics: readonly Diagnostic[]): void {
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) throw new ModelFormatError(errors);
}
