// SPDX-License-Identifier: EPL-2.0
import {
  HostCell,
  toCss,
  type Array2D,
  type Cell,
  type CellOccupant,
  type GridViewSpec,
} from '@metascape/engine';
import type { Agent, Scape, RootScape } from '@metascape/engine';
import { useCallback, useEffect, useMemo, useRef, type ReactElement, type Ref } from 'react';
import {
  CanvasSurface,
  type Camera,
  type CanvasSize,
  type CanvasSurfaceHandle,
} from './canvas-surface';
import { FALLBACK_ACCENT, themeColor } from './theme';

const DEFAULT_BACKGROUND = 0xeceff3;
/** Cells at least this wide (in CSS pixels) get occupant shapes instead of single pixels. */
const SHAPE_MIN_CELL_PIXELS = 4;

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

/**
 * Packs a `0xRRGGBB` colour as an opaque pixel for a `Uint32Array` that shares
 * its buffer with `ImageData` bytes, in the byte order of this machine.
 */
export function packColor(color: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return LITTLE_ENDIAN
    ? ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0
    : ((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0;
}

/** The lattice of a grid view: the space of its scape. */
export function latticeOf(spec: GridViewSpec): Array2D<Cell> {
  return spec.scape.space as unknown as Array2D<Cell>;
}

/** The occupants standing on a cell; none for a cell that cannot be stood on. */
export function occupantsOf(cell: Cell): readonly CellOccupant[] {
  return cell instanceof HostCell ? cell.occupants : [];
}

/** Options of {@link paintGrid}. */
export interface PaintGridOptions {
  /** Paint each occupant as one pixel on its cell. Default true. */
  readonly occupants?: boolean;
}

/**
 * Paints one pixel per cell, row by row, into `pixels` (length at least
 * width * height): the cell's colour from `cellColor` (or the background), then
 * the colour of each visible occupant on top when `occupants` is not false.
 * Pixels are packed with {@link packColor}. Needs no canvas.
 */
export function paintGrid(
  spec: GridViewSpec,
  pixels: Uint32Array,
  options: PaintGridOptions = {},
): void {
  const grid = latticeOf(spec);
  const { width, height } = grid;
  if (pixels.length < width * height) {
    throw new RangeError(`pixels holds ${pixels.length} values, ${width * height} needed`);
  }
  const background = packColor(spec.background ?? DEFAULT_BACKGROUND);
  pixels.fill(background, 0, width * height);
  const { cellColor, occupantColor } = spec;
  const withOccupants = options.occupants !== false && occupantColor !== undefined;
  for (const cell of grid.members) {
    const index = cell.y * width + cell.x;
    if (cellColor) pixels[index] = packColor(cellColor(cell));
    if (withOccupants) {
      for (const occupant of occupantsOf(cell)) {
        const color = occupantColor(occupant);
        if (color !== undefined) pixels[index] = packColor(color);
      }
    }
  }
}

/** The cell under a point given as fractions (0..1) of the grid's width and height. */
export function cellAtFraction(
  grid: Array2D<Cell>,
  fractionX: number,
  fractionY: number,
): Cell | undefined {
  const x = Math.floor(fractionX * grid.width);
  const y = Math.floor(fractionY * grid.height);
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return undefined;
  return grid.at(x, y);
}

/** Props of {@link GridView}. */
export interface GridViewProps {
  readonly spec: GridViewSpec;
  /** Changes on each frame to trigger a redraw. */
  readonly frame: number;
  /** Called when a cell is clicked, with its first occupant if there is one. */
  readonly onPick?: ((cell: Cell, occupant: CellOccupant | undefined) => void) | undefined;
  /** Called with the cell under the pointer, and with nothing when it leaves. */
  readonly onHover?: ((cell?: Cell, occupant?: CellOccupant) => void) | undefined;
  /** An agent or cell to mark as selected. */
  readonly selected?: Agent | undefined;
  /**
   * The running model. Given one, a lattice one row high is drawn as a
   * history: each period's row below the last, so change over time is visible.
   */
  readonly root?: RootScape | undefined;
  readonly fit?: 'width' | 'contain' | undefined;
  readonly zoomable?: boolean | undefined;
  readonly handleRef?: Ref<CanvasSurfaceHandle> | undefined;
  /** Called whenever the view is zoomed or panned. */
  readonly onCameraChange?: ((camera: Camera) => void) | undefined;
}

interface Buffer {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly image: ImageData;
  readonly pixels: Uint32Array;
}

function makeBuffer(width: number, height: number): Buffer | undefined {
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context || typeof context.createImageData !== 'function') return undefined;
  const image = context.createImageData(width, height);
  return { canvas, context, image, pixels: new Uint32Array(image.data.buffer) };
}

/** Where an agent or cell sits on a grid, if it does, and whether it is the cell itself. */
export function gridPositionOf(
  grid: Array2D<Cell>,
  agent: Agent | undefined,
): { x: number; y: number; cell: boolean } | undefined {
  if (!agent) return undefined;
  const own = grid.scape as unknown as Scape<Agent>;
  if (agent.scape === own) {
    const cell = agent as unknown as Cell;
    return { x: cell.x, y: cell.y, cell: true };
  }
  const cell = (agent as unknown as { hostCell?: Cell | undefined }).hostCell;
  if (cell && cell.scape === own) return { x: cell.x, y: cell.y, cell: false };
  return undefined;
}

/** Outlines a selected cell, in picture pixels, readable at any zoom. */
export function drawCellOutline(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  zoom: number,
): void {
  const accent = themeColor(context.canvas, '--ms-accent', FALLBACK_ACCENT);
  // Never smaller on screen than a few pixels, so a one-pixel cell still shows.
  const grow = Math.max(0, (6 / zoom - Math.min(width, height)) / 2);
  const left = x - grow;
  const top = y - grow;
  const w = width + grow * 2;
  const h = height + grow * 2;
  context.save();
  context.lineWidth = 3 / zoom;
  context.strokeStyle = 'rgba(0,0,0,0.75)';
  context.strokeRect(left, top, w, h);
  context.lineWidth = 1.5 / zoom;
  context.strokeStyle = accent;
  context.strokeRect(left, top, w, h);
  context.restore();
}

/** Draws a ring around a selected position, in picture pixels, readable at any zoom. */
export function drawSelection(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  zoom: number,
): void {
  const accent = themeColor(context.canvas, '--ms-accent', FALLBACK_ACCENT);
  const r = Math.max(radius, 5 / zoom);
  context.save();
  context.lineWidth = 3 / zoom;
  context.strokeStyle = 'rgba(0,0,0,0.75)';
  context.beginPath();
  context.arc(cx, cy, r + 2 / zoom, 0, Math.PI * 2);
  context.stroke();
  context.lineWidth = 2 / zoom;
  context.strokeStyle = accent;
  context.beginPath();
  context.arc(cx, cy, r + 2 / zoom, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

/** Rows of a one-row lattice, one per period, kept for {@link GridView}'s history. */
class RowHistory {
  readonly width: number;
  readonly depth: number;
  readonly pixels: Uint32Array;
  /** Periods recorded, oldest first; at most `depth`. */
  readonly periods: number[] = [];
  readonly #row: Uint32Array;

  constructor(width: number, depth: number) {
    this.width = width;
    this.depth = depth;
    this.pixels = new Uint32Array(width * depth);
    this.#row = new Uint32Array(width);
  }

  record(spec: GridViewSpec, period: number): void {
    if (this.periods[this.periods.length - 1] === period) return;
    paintGrid(spec, this.#row);
    if (this.periods.length === this.depth) {
      this.pixels.copyWithin(0, this.width);
      this.periods.shift();
    }
    this.pixels.set(this.#row, this.periods.length * this.width);
    this.periods.push(period);
  }
}

/** How many periods of history a one-row lattice keeps: about square, within limits. */
export function historyDepth(width: number): number {
  return Math.max(100, Math.min(600, width));
}

/**
 * A lattice drawn with one image pixel per cell, scaled up crisply, with
 * occupants on top as shapes once cells are big enough on screen. A lattice
 * one row high, given the root, becomes a scrolling history of its rows.
 */
export function GridView({
  spec,
  frame,
  onPick,
  onHover,
  selected,
  root,
  fit,
  zoomable,
  handleRef,
  onCameraChange,
}: GridViewProps): ReactElement {
  const bufferRef = useRef<Buffer | undefined>(undefined);
  const grid = latticeOf(spec);
  const historic = root !== undefined && grid.height === 1;
  // The history belongs to one run and spec; it fills as the model iterates.
  const history = useMemo(() => {
    if (!historic || !root) return undefined;
    const rows = new RowHistory(grid.width, historyDepth(grid.width));
    rows.record(spec, root.period);
    return rows;
  }, [historic, root, spec, grid.width]);

  useEffect(() => {
    if (!history || !root) return;
    return root.addScapeListener({ scapeIterated: (s) => history.record(spec, s.period) });
  }, [history, root, spec]);

  const rowsShown = history?.depth ?? grid.height;

  const draw = useCallback(
    (context: CanvasRenderingContext2D, size: CanvasSize) => {
      const zoom = size.zoom ?? 1;
      const cellPixels = size.width / grid.width;
      const cellHeight = size.height / rowsShown;
      if (history) {
        let buffer = bufferRef.current;
        if (!buffer || buffer.canvas.width !== grid.width || buffer.canvas.height !== rowsShown) {
          buffer = makeBuffer(grid.width, rowsShown);
          if (!buffer) return;
          bufferRef.current = buffer;
        }
        buffer.pixels.fill(0);
        buffer.pixels.set(history.pixels);
        buffer.context.putImageData(buffer.image, 0, 0);
        context.imageSmoothingEnabled = false;
        context.drawImage(buffer.canvas, 0, 0, size.width, size.height);
        // Mark the latest row so "now" is easy to find.
        const latest = history.periods.length - 1;
        const accent = themeColor(context.canvas, '--ms-accent', FALLBACK_ACCENT);
        context.fillStyle = accent;
        context.globalAlpha = 0.9;
        context.fillRect(-6 / zoom, latest * cellHeight, 4 / zoom, cellHeight);
        context.globalAlpha = 1;
        const at = gridPositionOf(grid, selected);
        if (at?.cell) {
          drawCellOutline(
            context,
            at.x * cellPixels,
            latest * cellHeight,
            cellPixels,
            cellHeight,
            zoom,
          );
        } else if (at) {
          drawSelection(
            context,
            (at.x + 0.5) * cellPixels,
            (latest + 0.5) * cellHeight,
            cellPixels / 2,
            zoom,
          );
        }
        return;
      }
      const shapes = spec.occupantColor !== undefined && cellPixels * zoom >= SHAPE_MIN_CELL_PIXELS;
      let buffer = bufferRef.current;
      if (!buffer || buffer.canvas.width !== grid.width || buffer.canvas.height !== grid.height) {
        buffer = makeBuffer(grid.width, grid.height);
        if (!buffer) return;
        bufferRef.current = buffer;
      }
      paintGrid(spec, buffer.pixels, { occupants: !shapes });
      buffer.context.putImageData(buffer.image, 0, 0);
      context.imageSmoothingEnabled = false;
      context.drawImage(
        buffer.canvas,
        0,
        0,
        grid.width,
        grid.height,
        0,
        0,
        size.width,
        size.height,
      );
      if (shapes && spec.occupantColor) {
        const radius = Math.min(cellPixels, cellHeight) * 0.4;
        for (const cell of grid.members) {
          const cx = (cell.x + 0.5) * cellPixels;
          const cy = (cell.y + 0.5) * cellHeight;
          for (const occupant of occupantsOf(cell)) {
            const color = spec.occupantColor(occupant);
            if (color === undefined) continue;
            context.fillStyle = toCss(color);
            if (spec.occupantShape === 'square') {
              context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
            } else {
              context.beginPath();
              context.arc(cx, cy, radius, 0, Math.PI * 2);
              context.fill();
            }
          }
        }
      }
      const at = gridPositionOf(grid, selected);
      if (at?.cell) {
        drawCellOutline(
          context,
          at.x * cellPixels,
          at.y * cellHeight,
          cellPixels,
          cellHeight,
          zoom,
        );
      } else if (at) {
        drawSelection(
          context,
          (at.x + 0.5) * cellPixels,
          (at.y + 0.5) * cellHeight,
          Math.min(cellPixels, cellHeight) / 2,
          zoom,
        );
      }
    },
    [spec, grid, history, rowsShown, selected],
  );

  const cellAt = useCallback(
    (fx: number, fy: number): Cell | undefined =>
      // A history row maps to the cell in that column now.
      history ? cellAtFraction(grid, fx, 0.5) : cellAtFraction(grid, fx, fy),
    [grid, history],
  );

  const pick = useCallback(
    (fx: number, fy: number) => {
      const cell = cellAt(fx, fy);
      if (cell && onPick) onPick(cell, occupantsOf(cell)[0]);
    },
    [cellAt, onPick],
  );

  const hover = useCallback(
    (fx?: number, fy?: number) => {
      if (!onHover) return;
      const cell = fx === undefined || fy === undefined ? undefined : cellAt(fx, fy);
      if (cell) onHover(cell, occupantsOf(cell)[0]);
      else onHover();
    },
    [cellAt, onHover],
  );

  return (
    <CanvasSurface
      aspect={rowsShown / grid.width}
      frame={frame}
      draw={draw}
      onPointer={onPick ? pick : undefined}
      onHover={onHover ? hover : undefined}
      label={
        history ? `${spec.title}: one row per period, time running down the picture` : spec.title
      }
      fit={fit}
      zoomable={zoomable}
      handleRef={handleRef}
      onCameraChange={onCameraChange}
    />
  );
}
