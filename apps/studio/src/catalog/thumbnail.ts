// SPDX-License-Identifier: EPL-2.0
import type { Color, Simulation, ViewSpec } from '@metascape/engine';
import { DEFAULT_PALETTE, historyDepth, paintGrid } from '@metascape/react';

/*
 * Draws a small picture of a model's main view without a browser, for the
 * Library's cards. Used by the catalogue generator, which writes PNGs.
 */

/** An RGBA picture. */
export interface Picture {
  readonly width: number;
  readonly height: number;
  /** Four bytes per pixel, row by row. */
  readonly rgba: Uint8Array;
  /** Whether it is one pixel per cell, to be scaled up crisply. */
  readonly pixelated: boolean;
}

const BACKGROUND: Color = 0x16181d;
const LINE: Color = 0x6b7280;
const SIZE = 192;

function canvas(width: number, height: number, background: Color): Picture & { set: Setter } {
  const rgba = new Uint8Array(width * height * 4);
  const r = (background >> 16) & 0xff;
  const g = (background >> 8) & 0xff;
  const b = background & 0xff;
  for (let i = 0; i < width * height; i++) rgba.set([r, g, b, 255], i * 4);
  const set: Setter = (x, y, color, alpha = 1) => {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    const i = (py * width + px) * 4;
    rgba[i] = rgba[i]! * (1 - alpha) + ((color >> 16) & 0xff) * alpha;
    rgba[i + 1] = rgba[i + 1]! * (1 - alpha) + ((color >> 8) & 0xff) * alpha;
    rgba[i + 2] = rgba[i + 2]! * (1 - alpha) + (color & 0xff) * alpha;
  };
  return { width, height, rgba, pixelated: false, set };
}

type Setter = (x: number, y: number, color: Color, alpha?: number) => void;

function disk(set: Setter, cx: number, cy: number, radius: number, color: Color): void {
  const r = Math.max(0.8, radius);
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) set(x, y, color);
    }
  }
}

function line(
  set: Setter,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: Color,
  alpha: number,
): void {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    set(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, color, alpha);
  }
}

/** The view a card should show: the first spatial one, else the first time series, else the first. */
export function primaryView(views: readonly ViewSpec[]): ViewSpec | undefined {
  return (
    views.find((v) => v.role === 'stage') ??
    views.find((v) => v.type === 'grid' || v.type === 'continuous' || v.type === 'network') ??
    views.find((v) => v.type === 'timeSeries') ??
    views[0]
  );
}

/**
 * Runs a simulation for a while and draws its main view. A one-row lattice is
 * drawn as its history, one row per tick, as the Workbench shows it.
 */
export function renderThumbnail(sim: Simulation, ticks: number): Picture | undefined {
  const view = primaryView(sim.views);
  if (!view) return undefined;
  if (view.type === 'grid' && view.grid.height === 1) {
    const width = view.grid.width;
    const depth = Math.min(historyDepth(width), 160);
    const pixels = new Uint32Array(width * depth);
    const row = new Uint32Array(width);
    let rows = 0;
    const record = (): void => {
      paintGrid(view, row);
      if (rows === depth) pixels.copyWithin(0, width);
      pixels.set(row, Math.min(rows, depth - 1) * width);
      rows = Math.min(depth, rows + 1);
    };
    record();
    for (let i = 1; i < depth && sim.step(); i++) record();
    const rgba = new Uint8Array(pixels.buffer.slice(0, width * rows * 4));
    return { width, height: rows, rgba, pixelated: true };
  }
  sim.run(ticks);
  if (view.type === 'grid') {
    const { width, height } = view.grid;
    const pixels = new Uint32Array(width * height);
    paintGrid(view, pixels);
    return { width, height, rgba: new Uint8Array(pixels.buffer), pixelated: true };
  }
  if (view.type === 'continuous') {
    const { scape } = view;
    const scale = SIZE / scape.width;
    const height = Math.max(1, Math.round(scape.height * scale));
    const picture = canvas(SIZE, height, view.background ?? BACKGROUND);
    for (const agent of scape.members) {
      const color = view.color?.(agent) ?? DEFAULT_PALETTE[0]!;
      disk(
        picture.set,
        agent.x * scale,
        agent.y * scale,
        (view.radius?.(agent) ?? 1) * scale,
        color,
      );
    }
    return picture;
  }
  if (view.type === 'network') {
    const picture = canvas(SIZE, SIZE, view.background ?? BACKGROUND);
    const members = view.nodes.members;
    const at = (i: number): [number, number] => {
      const angle = (i / members.length) * Math.PI * 2 - Math.PI / 2;
      return [SIZE * (0.5 + 0.42 * Math.cos(angle)), SIZE * (0.5 + 0.42 * Math.sin(angle))];
    };
    const index = new Map(members.map((agent, i) => [agent, i]));
    members.forEach((agent, i) => {
      for (const other of view.network.neighbors(agent)) {
        const j = index.get(other);
        if (j === undefined || j < i) continue;
        line(picture.set, ...at(i), ...at(j), LINE, 0.35);
      }
    });
    const radius = Math.max(1.2, Math.min(4, (Math.PI * SIZE * 0.84) / members.length / 3));
    members.forEach((agent, i) =>
      disk(picture.set, ...at(i), radius, view.color?.(agent) ?? DEFAULT_PALETTE[0]!),
    );
    return picture;
  }
  if (view.type === 'timeSeries') {
    const width = SIZE;
    const height = Math.round(SIZE * 0.62);
    const picture = canvas(width, height, BACKGROUND);
    const ticks = sim.data.ticks;
    const count = sim.data.sampleCount;
    const series = view.series.map((id) => sim.data.values(id).subarray(0, count));
    let low = Infinity;
    let high = -Infinity;
    for (const values of series) {
      for (const v of values) {
        if (!Number.isFinite(v)) continue;
        low = Math.min(low, v);
        high = Math.max(high, v);
      }
    }
    if (!Number.isFinite(low) || count < 2) return picture;
    if (high === low) high = low + 1;
    const last = ticks[count - 1]! || 1;
    const pad = 10;
    series.forEach((values, s) => {
      const color = view.colors?.[view.series[s]!] ?? DEFAULT_PALETTE[s % DEFAULT_PALETTE.length]!;
      for (let i = 1; i < count; i++) {
        const [a, b] = [values[i - 1]!, values[i]!];
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
        const x = (k: number): number => pad + (ticks[k]! / last) * (width - pad * 2);
        const y = (v: number): number =>
          height - pad - ((v - low) / (high - low)) * (height - pad * 2);
        line(picture.set, x(i - 1), y(a), x(i), y(b), color, 1);
      }
    });
    return picture;
  }
  return undefined;
}
