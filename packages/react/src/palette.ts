// SPDX-License-Identifier: EPL-2.0
import { colors, toCss, type Color } from '@metascape/engine';

/** Colours given to series in order when a spec does not choose its own. */
export const DEFAULT_PALETTE: readonly Color[] = [
  colors.blue,
  colors.orange,
  colors.green,
  colors.red,
  colors.purple,
  colors.teal,
  colors.pink,
  colors.brown,
  colors.yellow,
  colors.gray,
];

/** The CSS colour for the series with this id and position: from the spec, else the palette. */
export function seriesColor(
  chosen: Readonly<Record<string, Color>> | undefined,
  id: string,
  index: number,
): string {
  return toCss(chosen?.[id] ?? DEFAULT_PALETTE[index % DEFAULT_PALETTE.length]!);
}
