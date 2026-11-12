// SPDX-License-Identifier: EPL-2.0
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';

/** The drawing area handed to a canvas view, in CSS pixels. */
export interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

/** Props of {@link CanvasSurface}. */
export interface CanvasSurfaceProps {
  /** Height divided by width of the space being shown. */
  readonly aspect: number;
  /** Changes on every frame; a change redraws. */
  readonly frame: number;
  /**
   * Draws everything. The context is already scaled for `devicePixelRatio`
   * and cleared, so coordinates are CSS pixels. Pass a stable function (for
   * example with `useCallback`): a new one redraws.
   */
  readonly draw: (context: CanvasRenderingContext2D, size: CanvasSize) => void;
  /**
   * Called on click with the pointer position as fractions (0..1) of the
   * canvas, and the canvas's displayed width in CSS pixels.
   */
  readonly onPointer?:
    ((fractionX: number, fractionY: number, cssWidth: number) => void) | undefined;
  /** Accessible description of the picture. */
  readonly label: string;
}

/**
 * A canvas that fills its container's width, keeps an aspect ratio, matches
 * the device pixel ratio and redraws on frames and resizes. Does nothing when
 * the browser cannot give it a 2D context (as in jsdom).
 */
export function CanvasSurface({
  aspect,
  frame,
  draw,
  onPointer,
  label,
}: CanvasSurfaceProps): ReactElement {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    setWidth(Math.floor(wrap.clientWidth));
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width < 1) return;
    const dpr = window.devicePixelRatio || 1;
    const height = Math.max(1, Math.round(width * aspect));
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(context, { width: canvas.width / dpr, height: canvas.height / dpr });
  }, [draw, frame, width, aspect]);

  return (
    <div className="ms-canvas-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="ms-canvas"
        role="img"
        aria-label={label}
        style={{ aspectRatio: `1 / ${aspect}` }}
        onClick={
          onPointer
            ? (event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0) return;
                onPointer(
                  (event.clientX - rect.left) / rect.width,
                  (event.clientY - rect.top) / rect.height,
                  rect.width,
                );
              }
            : undefined
        }
      />
    </div>
  );
}
