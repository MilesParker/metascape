// SPDX-License-Identifier: EPL-2.0
import { toCss } from '@metascape/engine';

/** Background used when the theme defines no `--ms-surface`. */
export const FALLBACK_BACKGROUND = '#ffffff';
/** Colors used when the theme defines no `--ms-accent` / `--ms-text-muted`. */
export const FALLBACK_ACCENT = '#2f6fd0';
export const FALLBACK_MUTED = '#8a93a0';

/** The value of a CSS custom property on an element (so it follows light and dark themes). */
export function themeColor(element: Element, name: string, fallback: string): string {
  if (typeof getComputedStyle !== 'function') return fallback;
  return getComputedStyle(element).getPropertyValue(name).trim() || fallback;
}

/** CSS for a spec colour, or `fallback` when the spec gives none. */
export function colorOf(value: number | undefined, fallback: string): string {
  return value === undefined ? fallback : toCss(value);
}
