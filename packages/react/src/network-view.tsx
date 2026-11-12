// SPDX-License-Identifier: EPL-2.0
import { toCss, type Agent, type NetworkViewSpec } from '@metascape/engine';
import { useCallback, type ReactElement } from 'react';
import { CanvasSurface, type CanvasSize } from './canvas-surface';
import { FALLBACK_ACCENT, FALLBACK_BACKGROUND, FALLBACK_MUTED, colorOf, themeColor } from './theme';

const LINK_ALPHA = 0.6;
const PICK_SLOP_PIXELS = 6;

/** Props of {@link NetworkView}. */
export interface NetworkViewProps {
  readonly spec: NetworkViewSpec;
  /** Changes on each frame to trigger a redraw. */
  readonly frame: number;
  /** Called when a node is clicked. */
  readonly onPick?: ((agent: Agent) => void) | undefined;
}

/** Node `index` of `count`, evenly spaced on a circle starting at the top, as fractions of the canvas. */
function nodePosition(index: number, count: number): { x: number; y: number } {
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
  return { x: 0.5 + 0.42 * Math.cos(angle), y: 0.5 + 0.42 * Math.sin(angle) };
}

function nodeRadius(count: number, width: number): number {
  const spacing = (Math.PI * 2 * 0.42 * width) / Math.max(1, count);
  return Math.max(2, Math.min(9, spacing * 0.35));
}

/**
 * The members of a scape as nodes on a circle in membership order, with the
 * network's links as thin lines. The `force` layout is drawn as a circle too.
 */
export function NetworkView({ spec, frame, onPick }: NetworkViewProps): ReactElement {
  const draw = useCallback(
    (context: CanvasRenderingContext2D, size: CanvasSize) => {
      const members = spec.nodes.members;
      const count = members.length;
      const defaultColor = themeColor(context.canvas, '--ms-accent', FALLBACK_ACCENT);
      const index = new Map<Agent, number>();
      members.forEach((agent, i) => index.set(agent, i));
      context.fillStyle =
        spec.background === undefined
          ? themeColor(context.canvas, '--ms-surface', FALLBACK_BACKGROUND)
          : toCss(spec.background);
      context.fillRect(0, 0, size.width, size.height);

      context.strokeStyle = themeColor(context.canvas, '--ms-text-muted', FALLBACK_MUTED);
      context.globalAlpha = LINK_ALPHA;
      context.lineWidth = 1;
      context.beginPath();
      members.forEach((agent, i) => {
        const from = nodePosition(i, count);
        for (const other of spec.network.neighbors(agent)) {
          const j = index.get(other);
          if (j === undefined || (!spec.network.directed && j < i)) continue;
          const to = nodePosition(j, count);
          context.moveTo(from.x * size.width, from.y * size.height);
          context.lineTo(to.x * size.width, to.y * size.height);
        }
      });
      context.stroke();
      context.globalAlpha = 1;

      const radius = nodeRadius(count, size.width);
      members.forEach((agent, i) => {
        const at = nodePosition(i, count);
        context.fillStyle = colorOf(spec.color?.(agent), defaultColor);
        context.beginPath();
        context.arc(at.x * size.width, at.y * size.height, radius, 0, Math.PI * 2);
        context.fill();
      });
    },
    [spec],
  );

  const pick = useCallback(
    (fx: number, fy: number, cssWidth: number) => {
      if (!onPick) return;
      const members = spec.nodes.members;
      const reach = Math.max(nodeRadius(members.length, cssWidth), PICK_SLOP_PIXELS);
      let best: Agent | undefined;
      let bestDistance = Infinity;
      members.forEach((agent, i) => {
        const at = nodePosition(i, members.length);
        const distance = Math.hypot(at.x - fx, at.y - fy) * cssWidth;
        if (distance <= reach && distance < bestDistance) {
          best = agent;
          bestDistance = distance;
        }
      });
      if (best) onPick(best);
    },
    [spec, onPick],
  );

  return (
    <CanvasSurface
      aspect={1}
      frame={frame}
      draw={draw}
      onPointer={onPick ? pick : undefined}
      label={spec.title}
    />
  );
}
