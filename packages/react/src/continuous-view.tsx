// SPDX-License-Identifier: EPL-2.0
import { toCss, type Agent, type ContinuousViewSpec, type PointAgent } from '@metascape/engine';
import { useCallback, type ReactElement, type Ref } from 'react';
import {
  CanvasSurface,
  type Camera,
  type CanvasSize,
  type CanvasSurfaceHandle,
} from './canvas-surface';
import { drawSelection } from './grid-view';
import { FALLBACK_ACCENT, FALLBACK_BACKGROUND, colorOf, themeColor } from './theme';

const MIN_RADIUS_PIXELS = 1.5;
/** How close (in CSS pixels) a click must be to pick an agent, at least. */
const PICK_SLOP_PIXELS = 6;
/** Space kept around the picture so agents on its edges are drawn whole, as a fraction of the width. */
const MARGIN = 0.02;

/** Props of {@link ContinuousView}. */
export interface ContinuousViewProps {
  readonly spec: ContinuousViewSpec;
  /** Changes on each frame to trigger a redraw. */
  readonly frame: number;
  /** Called when an agent is clicked. */
  readonly onPick?: ((agent: PointAgent) => void) | undefined;
  /** Called with the agent under the pointer, and with nothing when there is none. */
  readonly onHover?: ((agent?: PointAgent) => void) | undefined;
  readonly selected?: Agent | undefined;
  readonly fit?: 'width' | 'contain' | undefined;
  readonly zoomable?: boolean | undefined;
  readonly handleRef?: Ref<CanvasSurfaceHandle> | undefined;
  /** Called whenever the view is zoomed or panned. */
  readonly onCameraChange?: ((camera: Camera) => void) | undefined;
}

function radiusPixels(spec: ContinuousViewSpec, agent: PointAgent, scale: number): number {
  return Math.max(MIN_RADIUS_PIXELS, (spec.radius?.(agent) ?? 1) * scale);
}

/** Room for the labels of an outline's corners, as a fraction of the width. */
const LABEL_MARGIN = 0.1;

/** The space's extent including the margin, in space units. */
function extent(spec: ContinuousViewSpec): { pad: number; width: number; height: number } {
  const pad = spec.scape.width * (spec.outline?.labels ? LABEL_MARGIN : MARGIN);
  return { pad, width: spec.scape.width + pad * 2, height: spec.scape.height + pad * 2 };
}

/** Height over width of a continuous view as drawn, margin included. */
export function continuousAspect(spec: ContinuousViewSpec): number {
  const box = extent(spec);
  return box.height / box.width;
}

/** Draws a view's outline and its corner labels, in space units already scaled. */
function drawOutline(
  context: CanvasRenderingContext2D,
  outline: NonNullable<ContinuousViewSpec['outline']>,
  scale: number,
  zoom: number,
): void {
  const { points, labels } = outline;
  if (points.length < 2) return;
  const muted = themeColor(context.canvas, '--ms-text-muted', '#667');
  context.save();
  context.strokeStyle = muted;
  context.globalAlpha = 0.6;
  context.lineWidth = 1 / zoom;
  context.beginPath();
  points.forEach(([x, y], i) => {
    if (i === 0) context.moveTo(x * scale, y * scale);
    else context.lineTo(x * scale, y * scale);
  });
  context.closePath();
  context.stroke();
  if (labels) {
    // Each label just outside its corner, away from the middle of the shape.
    const cx = points.reduce((sum, [x]) => sum + x, 0) / points.length;
    const cy = points.reduce((sum, [, y]) => sum + y, 0) / points.length;
    context.globalAlpha = 1;
    context.fillStyle = muted;
    context.font = `${11 / zoom}px ${themeColor(context.canvas, '--ms-font', 'system-ui, sans-serif')}`;
    points.forEach(([x, y], i) => {
      const label = labels[i];
      if (!label) return;
      const dx = x - cx;
      const dy = y - cy;
      const length = Math.hypot(dx, dy) || 1;
      const gap = 10 / zoom;
      context.textAlign = Math.abs(dx / length) < 0.3 ? 'center' : dx < 0 ? 'right' : 'left';
      context.textBaseline = Math.abs(dy / length) < 0.3 ? 'middle' : dy < 0 ? 'bottom' : 'top';
      context.fillText(label, x * scale + (dx / length) * gap, y * scale + (dy / length) * gap);
    });
  }
  context.restore();
}

/** The agent nearest a point given as fractions of the picture, if one is within reach. */
function agentAt(
  spec: ContinuousViewSpec,
  fx: number,
  fy: number,
  cssWidth: number,
): PointAgent | undefined {
  const { pad, width, height } = extent(spec);
  const scale = cssWidth / width;
  const px = fx * width - pad;
  const py = fy * height - pad;
  let best: PointAgent | undefined;
  let bestDistance = Infinity;
  for (const agent of spec.scape.members) {
    const distance = Math.hypot(agent.x - px, agent.y - py) * scale;
    const reach = Math.max(radiusPixels(spec, agent, scale), PICK_SLOP_PIXELS);
    if (distance <= reach && distance < bestDistance) {
      best = agent;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Agents in a continuous rectangle: circles sized in space units (never
 * under 1.5 screen pixels), or small triangles pointing along `heading`.
 */
export function ContinuousView({
  spec,
  frame,
  onPick,
  onHover,
  selected,
  fit,
  zoomable,
  handleRef,
  onCameraChange,
}: ContinuousViewProps): ReactElement {
  const { scape } = spec;
  const box = extent(spec);

  const draw = useCallback(
    (context: CanvasRenderingContext2D, size: CanvasSize) => {
      const { pad, width } = extent(spec);
      const scale = size.width / width;
      const zoom = size.zoom ?? 1;
      const minRadius = MIN_RADIUS_PIXELS / zoom;
      const defaultColor = themeColor(context.canvas, '--ms-accent', FALLBACK_ACCENT);
      context.fillStyle =
        spec.background === undefined
          ? themeColor(context.canvas, '--ms-surface', FALLBACK_BACKGROUND)
          : toCss(spec.background);
      context.fillRect(0, 0, size.width, size.height);
      context.save();
      context.translate(pad * scale, pad * scale);
      if (spec.outline) drawOutline(context, spec.outline, scale, zoom);
      for (const agent of scape.members) {
        const r = Math.max(minRadius, (spec.radius?.(agent) ?? 1) * scale);
        context.fillStyle = colorOf(spec.color?.(agent), defaultColor);
        const x = agent.x * scale;
        const y = agent.y * scale;
        const heading = spec.heading?.(agent);
        context.beginPath();
        if (heading === undefined) {
          context.arc(x, y, r, 0, Math.PI * 2);
        } else {
          const length = Math.max(3 / zoom, r * 1.6);
          const cos = Math.cos(heading);
          const sin = Math.sin(heading);
          // Tip ahead of the agent, two base corners behind and to either side.
          const corner = (forward: number, side: number): [number, number] => [
            x + forward * cos - side * sin,
            y + forward * sin + side * cos,
          ];
          context.moveTo(...corner(length, 0));
          context.lineTo(...corner(-length * 0.7, length * 0.5));
          context.lineTo(...corner(-length * 0.7, -length * 0.5));
          context.closePath();
        }
        context.fill();
      }
      if (selected && selected.alive && selected.scape === (scape as unknown)) {
        const agent = selected as PointAgent;
        drawSelection(
          context,
          agent.x * scale,
          agent.y * scale,
          radiusPixels(spec, agent, scale),
          zoom,
        );
      }
      context.restore();
    },
    [spec, scape, selected],
  );

  const pick = useCallback(
    (fx: number, fy: number, cssWidth: number) => {
      const agent = onPick && agentAt(spec, fx, fy, cssWidth);
      if (agent) onPick(agent);
    },
    [spec, onPick],
  );

  const hover = useCallback(
    (fx?: number, fy?: number, cssWidth?: number) => {
      if (!onHover) return;
      if (fx === undefined || fy === undefined || cssWidth === undefined) onHover();
      else onHover(agentAt(spec, fx, fy, cssWidth));
    },
    [spec, onHover],
  );

  return (
    <CanvasSurface
      aspect={box.height / box.width}
      frame={frame}
      draw={draw}
      onPointer={onPick ? pick : undefined}
      onHover={onHover ? hover : undefined}
      label={spec.title}
      fit={fit}
      zoomable={zoomable}
      handleRef={handleRef}
      onCameraChange={onCameraChange}
    />
  );
}
