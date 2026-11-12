// SPDX-License-Identifier: EPL-2.0
import {
  toCss,
  type Cell,
  type GridScape,
  type GridViewSpec,
  type Occupant,
} from '@metascape/engine';
import { useCallback, useRef, type ReactElement } from 'react';
import { CanvasSurface, type CanvasSize } from './canvas-surface';

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
  const { width, height } = spec.grid;
  if (pixels.length < width * height) {
    throw new RangeError(`pixels holds ${pixels.length} values, ${width * height} needed`);
  }
  const background = packColor(spec.background ?? DEFAULT_BACKGROUND);
  pixels.fill(background, 0, width * height);
  const { cellColor, occupantColor } = spec;
  const withOccupants = options.occupants !== false && occupantColor !== undefined;
  for (const cell of spec.grid.members) {
    const index = cell.y * width + cell.x;
    if (cellColor) pixels[index] = packColor(cellColor(cell));
    if (withOccupants) {
      for (const occupant of cell.occupants) {
        const color = occupantColor(occupant);
        if (color !== undefined) pixels[index] = packColor(color);
      }
    }
  }
}

/** The cell under a point given as fractions (0..1) of the grid's width and height. */
export function cellAtFraction(
  grid: GridScape<Cell>,
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
  readonly onPick?: ((cell: Cell, occupant: Occupant | undefined) => void) | undefined;
}

interface Buffer {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly image: ImageData;
  readonly pixels: Uint32Array;
}

/** A lattice drawn with one image pixel per cell, scaled up crisply, with occupants on top. */
export function GridView({ spec, frame, onPick }: GridViewProps): ReactElement {
  const bufferRef = useRef<Buffer | undefined>(undefined);
  const { grid } = spec;

  const draw = useCallback(
    (context: CanvasRenderingContext2D, size: CanvasSize) => {
      const cellPixels = size.width / grid.width;
      const shapes = spec.occupantColor !== undefined && cellPixels >= SHAPE_MIN_CELL_PIXELS;
      let buffer = bufferRef.current;
      if (!buffer || buffer.canvas.width !== grid.width || buffer.canvas.height !== grid.height) {
        const canvas = document.createElement('canvas');
        canvas.width = grid.width;
        canvas.height = grid.height;
        const own = canvas.getContext('2d');
        if (!own) return;
        const image = own.createImageData(grid.width, grid.height);
        buffer = { canvas, context: own, image, pixels: new Uint32Array(image.data.buffer) };
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
      if (!shapes || !spec.occupantColor) return;
      const cellHeight = size.height / grid.height;
      const radius = Math.min(cellPixels, cellHeight) * 0.4;
      for (const cell of grid.members) {
        const cx = (cell.x + 0.5) * cellPixels;
        const cy = (cell.y + 0.5) * cellHeight;
        for (const occupant of cell.occupants) {
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
    },
    [spec, grid],
  );

  const pick = useCallback(
    (fx: number, fy: number) => {
      const cell = cellAtFraction(grid, fx, fy);
      if (cell && onPick) onPick(cell, cell.occupant);
    },
    [grid, onPick],
  );

  return (
    <CanvasSurface
      aspect={grid.height / grid.width}
      frame={frame}
      draw={draw}
      onPointer={onPick ? pick : undefined}
      label={spec.title}
    />
  );
}
