// SPDX-License-Identifier: EPL-2.0
import { type RootScape, type ViewSpec } from '@metascape/engine';

/**
 * Turns an identifier into words: `retiredShareOfEligible` becomes "Retired
 * share of eligible", `strategy0` "Strategy 0", `max_age` "Max age". Text that
 * already reads as words (it has a space and no camel humps) is left alone
 * apart from a capital first letter.
 */
export function humanize(text: string): string {
  const words = text
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  const lowered = words
    .split(' ')
    .map((word, i) => (i > 0 && /^[A-Z][a-z]+$/.test(word) ? word.toLowerCase() : word))
    .join(' ');
  return lowered.charAt(0).toUpperCase() + lowered.slice(1);
}

/** The readable label of a collected series in a chart: the chart's own, else the series', humanized. */
export function seriesLabel(root: RootScape, id: string, spec?: ViewSpec): string {
  const own = spec && 'labels' in spec ? spec.labels?.[id] : undefined;
  if (own) return own;
  try {
    return humanize(root.data.get(id).label);
  } catch {
    return humanize(id);
  }
}

/** What the model's periods are, singular and plural; "period" when it does not say. */
export function timeUnit(root: RootScape): { singular: string; plural: string } {
  const scale = root.model.period;
  if (!scale) return { singular: 'period', plural: 'periods' };
  return { singular: scale.name, plural: scale.plural ?? `${scale.name}s` };
}

/** A period as text, such as "year 1043" or "period 12". */
export function describeTime(root: RootScape, period: number): string {
  return `${timeUnit(root).singular} ${formatNumber(period)}`;
}

/** Short readable text for a number: integers with digit grouping, others to four significant digits. */
export function formatNumber(value: number): string {
  if (Number.isNaN(value)) return '–';
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '−∞';
  if (Number.isInteger(value))
    return Math.abs(value) >= 10000 ? value.toLocaleString('en-US') : String(value);
  return String(Number(value.toPrecision(4)));
}
