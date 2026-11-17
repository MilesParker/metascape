// SPDX-License-Identifier: EPL-2.0
//
// Measurements (the measures of ATest constraints and of chart series) in
// terms of a model, and in terms of the statistics the interpreter collects.
import type { RootScape } from '@metascape/engine';
import { actsOf } from '../metamodel/model-index';
import type { Agent, Attribute, AttributeRef, Model, Scape } from '../metamodel/types';
import type { Constraint, Measurement } from './types';

/** The agent or scape at a path from the root scape, such as `city.individual`. */
export function agentAt(model: Model, ref: string): Agent | Scape | undefined {
  let found: Model | Agent | Scape = model;
  for (const id of ref.split('.')) {
    const next: Agent | Scape | undefined =
      'agents' in found ? (found as Scape).agents?.[id] : undefined;
    if (!next) return undefined;
    found = next;
  }
  return found === model ? undefined : (found as Agent | Scape);
}

/**
 * The attribute a parameter reference names: an attribute of the root scape
 * (`individualCount`) or of one of its spaces (`city.width`).
 */
export function parameterAttribute(model: Model, ref: AttributeRef): Attribute | undefined {
  const parts = ref.split('.');
  if (parts.length === 1) return model.attributes?.[parts[0]!];
  if (parts.length === 2) return model.spaces?.[parts[0]!]?.attributes?.[parts[1]!];
  return undefined;
}

/** The attribute a measurement is of, if it names one that its agent has. */
export function measuredAttribute(model: Model, m: Measurement): Attribute | undefined {
  if (m.attribute === undefined) return undefined;
  return agentAt(model, m.agent)?.attributes?.[m.attribute];
}

/** The attributes a list of measurements are of, as references from the root scape (`bug.size`). */
export function measuredAttributes(measurements: readonly Measurement[]): AttributeRef[] {
  const refs = measurements.flatMap((m) =>
    m.attribute === undefined ? [] : [`${m.agent}.${m.attribute}`],
  );
  return [...new Set(refs)];
}

/** Whether an agent type is the cells of a grid, which the interpreter does not count. */
function isCell(model: Model, agent: string): boolean {
  const visit = (scape: Model | Scape): boolean =>
    [scape, ...Object.values(scape.agents ?? {})].some((holder) =>
      actsOf(holder.acts).some(([, act]) => act.kind === 'buildGrid' && act.fillAgent === agent),
    ) || Object.values(scape.agents ?? {}).some((child) => child.kind === 'scape' && visit(child));
  return visit(model);
}

const STATISTIC = { average: 'mean', sum: 'sum', minimum: 'min', maximum: 'max' } as const;

/**
 * Where a measurement's value is found in a run's statistics: the series the
 * interpreter collects for it, or two series whose difference it is (the
 * agents whose boolean attribute is false are all of them less those for
 * which it is true). Undefined if the interpreter collects nothing for it:
 * statistics are collected for the agents of the root scape only, and the
 * cells of a grid are not counted.
 */
export function seriesOf(
  model: Model,
  m: Measurement,
): { id: string } | { all: string; less: string } | undefined {
  if (m.agent.includes('.')) return undefined;
  if (m.attribute === undefined) {
    return m.measure === 'count' && !isCell(model, m.agent)
      ? { id: `${m.agent}.count` }
      : undefined;
  }
  const attribute = measuredAttribute(model, m);
  if (!attribute) return undefined;
  const base = `${m.agent}.${m.attribute}`;
  if (attribute.type === 'integer' || attribute.type === 'real') {
    if (m.qualifier !== undefined) return undefined;
    return { id: `${base}.${m.measure === 'count' ? 'count' : STATISTIC[m.measure]}` };
  }
  if (m.measure !== 'count') return undefined;
  if (attribute.type === 'boolean') {
    if (m.qualifier === undefined || m.qualifier === true) return { id: base };
    if (m.qualifier === false && !isCell(model, m.agent)) {
      return { all: `${m.agent}.count`, less: base };
    }
    return undefined;
  }
  if (attribute.type === 'state' && typeof m.qualifier === 'string') {
    return attribute.options[m.qualifier] ? { id: `${base}.${m.qualifier}` } : undefined;
  }
  return undefined;
}

/** The value of a measurement in a run, as of the last period collected; undefined if it is not collected. */
export function measureValue(root: RootScape, model: Model, m: Measurement): number | undefined {
  const series = seriesOf(model, m);
  if (!series) return undefined;
  const has = (id: string) => root.data.series.some((s) => s.id === id);
  if ('id' in series) return has(series.id) ? root.data.latest(series.id) : undefined;
  return has(series.all) && has(series.less)
    ? root.data.latest(series.all) - root.data.latest(series.less)
    : undefined;
}

const STATISTIC_WORDS = {
  count: 'Count',
  average: 'Mean',
  sum: 'Total',
  minimum: 'Least',
  maximum: 'Most',
} as const;

/**
 * A readable name for a measurement, from the labels in the model:
 * `Count(Individual.Status=Dead)` is "Dead", `Count(Forager)` "Foragers",
 * `Average(Bug.Size)` "Mean Size", `Count(Player.Cooperate)` "Cooperate", and
 * the count of residents whose `happy` is false "Residents not happy".
 */
export function measurementLabel(model: Model, m: Measurement): string {
  const agent = agentAt(model, m.agent);
  if (m.attribute === undefined) return agent?.pluralLabel ?? agent?.label ?? m.agent;
  const attribute = agent?.attributes?.[m.attribute];
  const name = attribute?.label ?? m.attribute;
  if (m.measure === 'count' && attribute?.type === 'state' && typeof m.qualifier === 'string') {
    return attribute.options[m.qualifier]?.label ?? m.qualifier;
  }
  if (m.measure === 'count' && attribute?.type === 'boolean') {
    const plural = agent?.pluralLabel ?? agent?.label ?? m.agent;
    return m.qualifier === false ? `${plural} not ${name.toLowerCase()}` : name;
  }
  return `${STATISTIC_WORDS[m.measure]} ${name}`;
}

/** A constraint in words, such as "Foragers = 0" or "Dead from 0 to 5". */
export function describeConstraint(model: Model, c: Constraint): string {
  const label = measurementLabel(model, c);
  return c.min === c.max ? `${label} = ${c.min}` : `${label} from ${c.min} to ${c.max}`;
}
