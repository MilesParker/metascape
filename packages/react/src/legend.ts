// SPDX-License-Identifier: EPL-2.0
import type { Color, LegendEntry, ViewSpec } from '@metascape/engine';
import { latticeOf, occupantsOf } from './grid-view';

/** One entry of a legend as shown: a declared entry, or a colour found in the picture. */
export interface ShownLegendEntry {
  readonly color: Color;
  /** Undefined for a colour found in the picture that the model does not name. */
  readonly label: string | undefined;
  readonly mark: 'cell' | 'agent' | 'link';
  /** How many cells or agents have the colour now, when counted. */
  readonly count?: number;
}

/** A view's legend: what the model declares, or the colours present when it declares none. */
export interface Legend {
  readonly entries: readonly ShownLegendEntry[];
  /** Whether the entries come from the model rather than from looking at the picture. */
  readonly declared: boolean;
  /** Set when the picture has too many colours to list, as with a colour gradient. */
  readonly continuous: boolean;
}

/** Colours beyond this many are treated as a continuous scale and not listed. */
const MAX_FOUND = 10;

function tally(
  found: Map<string, { color: Color; mark: ShownLegendEntry['mark']; count: number }>,
  color: Color | undefined,
  mark: ShownLegendEntry['mark'],
): void {
  if (color === undefined) return;
  const key = `${mark}:${color}`;
  const entry = found.get(key);
  if (entry) entry.count++;
  else found.set(key, { color, mark, count: 1 });
}

/**
 * The legend of a spatial view. A declared legend is returned as is; otherwise
 * the colours of cells and agents are counted, most common first, and the
 * legend is marked `continuous` when there are too many to list. Charts have
 * no legend here (they label their series).
 */
export function legendOf(spec: ViewSpec): Legend | undefined {
  if (spec.type !== 'grid' && spec.type !== 'continuous' && spec.type !== 'network') {
    return undefined;
  }
  if (spec.legend && spec.legend.length > 0) {
    return {
      declared: true,
      continuous: false,
      entries: spec.legend.map((entry: LegendEntry) => ({
        color: entry.color,
        label: entry.label,
        mark: entry.mark ?? (spec.type === 'grid' ? 'cell' : 'agent'),
      })),
    };
  }
  const found = new Map<string, { color: Color; mark: ShownLegendEntry['mark']; count: number }>();
  if (spec.type === 'grid') {
    for (const cell of latticeOf(spec).members) {
      if (spec.cellColor) tally(found, spec.cellColor(cell), 'cell');
      if (spec.occupantColor) {
        for (const occupant of occupantsOf(cell))
          tally(found, spec.occupantColor(occupant), 'agent');
      }
    }
  } else if (spec.type === 'continuous') {
    for (const agent of spec.scape.members) tally(found, spec.color?.(agent), 'agent');
  } else {
    for (const agent of spec.nodes.members) tally(found, spec.color?.(agent), 'agent');
  }
  const byMark = (mark: ShownLegendEntry['mark']) =>
    [...found.values()].filter((entry) => entry.mark === mark);
  const cells = byMark('cell');
  const agents = byMark('agent');
  const continuous = cells.length > MAX_FOUND || agents.length > MAX_FOUND;
  const list = (entries: typeof cells) =>
    entries.length > MAX_FOUND
      ? []
      : entries.sort((a, b) => b.count - a.count).map((entry) => ({ ...entry, label: undefined }));
  return { declared: false, continuous, entries: [...list(agents), ...list(cells)] };
}
