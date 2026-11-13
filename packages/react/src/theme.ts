// SPDX-License-Identifier: EPL-2.0
import { toCss } from '@metascape/engine';
import { useSyncExternalStore } from 'react';

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

let themeVersion = 0;
const themeListeners = new Set<() => void>();
let themeWatching = false;

function watchTheme(): void {
  if (themeWatching || typeof document === 'undefined') return;
  themeWatching = true;
  const bump = (): void => {
    themeVersion++;
    for (const listener of themeListeners) listener();
  };
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(bump).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    });
  }
  if (typeof matchMedia === 'function') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', bump);
  }
}

/**
 * A number that changes whenever the page's theme may have changed: the
 * `class`, `data-theme` or `style` of the root element, or the system colour
 * scheme. Canvases and charts that read theme colours redraw when it changes.
 */
export function useThemeVersion(): number {
  return useSyncExternalStore(
    (notify) => {
      watchTheme();
      themeListeners.add(notify);
      return () => themeListeners.delete(notify);
    },
    () => themeVersion,
    () => 0,
  );
}

/** Relative luminance of an `0xRRGGBB` colour, 0 (black) to 1 (white). */
export function luminance(color: number): number {
  const channel = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((color >> 16) & 0xff) +
    0.7152 * channel((color >> 8) & 0xff) +
    0.0722 * channel(color & 0xff)
  );
}

/** Parses `#rgb`, `#rrggbb` or `rgb(r, g, b)` to `0xRRGGBB`; undefined when it cannot. */
export function parseCssColor(css: string): number | undefined {
  const text = css.trim();
  let match = /^#([0-9a-f]{3})$/i.exec(text);
  if (match) {
    const [r, g, b] = match[1]!.split('').map((c) => parseInt(c + c, 16));
    return (r! << 16) | (g! << 8) | b!;
  }
  match = /^#([0-9a-f]{6})$/i.exec(text);
  if (match) return parseInt(match[1]!, 16);
  match = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(text);
  if (match) return (Number(match[1]) << 16) | (Number(match[2]) << 8) | Number(match[3]);
  return undefined;
}

/**
 * A series colour that stays visible on the given background: colours with
 * too little contrast (black on a dark theme, white on a light one) are swapped
 * for the theme's text colour.
 */
export function readableOn(color: number, background: string, fallback: string): string {
  const bg = parseCssColor(background);
  if (bg === undefined) return toCss(color);
  const [light, dark] = [luminance(color), luminance(bg)].sort((a, b) => b - a) as [number, number];
  return (light + 0.05) / (dark + 0.05) < 1.6 ? fallback : toCss(color);
}
