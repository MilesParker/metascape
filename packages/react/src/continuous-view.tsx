// SPDX-License-Identifier: EPL-2.0
import { toCss, type ContinuousViewSpec, type PointAgent } from '@metascape/engine';
import { useCallback, type ReactElement } from 'react';
import { CanvasSurface, type CanvasSize } from './canvas-surface';

const DEFAULT_BACKGROUND = 0xeceff3;
const DEFAULT_COLOR = 0x3b7dd8;
const MIN_RADIUS_PIXELS = 1.5;
/** How close (in CSS pixels) a click must be to pick an agent, at least. */
const PICK_SLOP_PIXELS = 6;

/** Props of {@link ContinuousView}. */
export interface ContinuousViewProps {
  readonly spec: ContinuousViewSpec;
  /** Changes on each frame to trigger a redraw. */
  readonly frame: number;
  /** Called when an agent is clicked. */
  readonly onPick?: ((agent: PointAgent) => void) | undefined;
}

function radiusPixels(spec: ContinuousViewSpec, agent: PointAgent, scale: number): number {
  return Math.max(MIN_RADIUS_PIXELS, (spec.radius?.(agent) ?? 1) * scale);
}

/**
 * Agents in a continuous rectangle: circles sized in space units (never
 * under 1.5 screen pixels), or small triangles pointing along `heading`.
 */
export function ContinuousView({ spec, frame, onPick }: ContinuousViewProps): ReactElement {
  const { scape } = spec;

  const draw = useCallback(
    (context: CanvasRenderingContext2D, size: CanvasSize) => {
      const scale = size.width / scape.width;
      context.fillStyle = toCss(spec.background ?? DEFAULT_BACKGROUND);
      context.fillRect(0, 0, size.width, size.height);
      for (const agent of scape.members) {
        const r = radiusPixels(spec, agent, scale);
        context.fillStyle = toCss(spec.color?.(agent) ?? DEFAULT_COLOR);
        const x = agent.x * scale;
        const y = agent.y * scale;
        const heading = spec.heading?.(agent);
        context.beginPath();
        if (heading === undefined) {
          context.arc(x, y, r, 0, Math.PI * 2);
        } else {
          const length = Math.max(3, r * 1.6);
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
    },
    [spec, scape],
  );

  const pick = useCallback(
    (fx: number, fy: number, cssWidth: number) => {
      if (!onPick) return;
      const scale = cssWidth / scape.width;
      const px = fx * scape.width;
      const py = fy * scape.height;
      let best: PointAgent | undefined;
      let bestDistance = Infinity;
      for (const agent of scape.members) {
        const distance = Math.hypot(agent.x - px, agent.y - py) * scale;
        const reach = Math.max(radiusPixels(spec, agent, scale), PICK_SLOP_PIXELS);
        if (distance <= reach && distance < bestDistance) {
          best = agent;
          bestDistance = distance;
        }
      }
      if (best) onPick(best);
    },
    [spec, scape, onPick],
  );

  return (
    <CanvasSurface
      aspect={scape.height / scape.width}
      frame={frame}
      draw={draw}
      onPointer={onPick ? pick : undefined}
      label={spec.title}
    />
  );
}
