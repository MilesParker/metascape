// SPDX-License-Identifier: EPL-2.0
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type Ref,
} from 'react';
import { useThemeVersion } from './theme';

/** The drawing area handed to a canvas view, in CSS pixels of the unzoomed picture. */
export interface CanvasSize {
  readonly width: number;
  readonly height: number;
  /** How far the picture is magnified on screen; 1 when not zoomed. */
  readonly zoom?: number;
}

/** Magnification and offset of the picture inside its surface. */
export interface Camera {
  /** 1 shows the whole picture. */
  readonly zoom: number;
  /** Offset of the picture from its centred position, in CSS pixels. */
  readonly x: number;
  readonly y: number;
}

/** Commands a surface accepts from outside, such as zoom buttons. */
export interface CanvasSurfaceHandle {
  zoomBy(factor: number): void;
  /** Shows the whole picture again. */
  reset(): void;
  readonly camera: Camera;
  /** The canvas element, for example to save the picture as an image. */
  readonly canvas: HTMLCanvasElement | null;
}

/** Props of {@link CanvasSurface}. */
export interface CanvasSurfaceProps {
  /** Height divided by width of the space being shown. */
  readonly aspect: number;
  /** Changes on every frame; a change redraws. */
  readonly frame: number;
  /**
   * Draws everything. The context is already scaled for `devicePixelRatio`
   * and for zoom and pan, and cleared, so coordinates are CSS pixels of the
   * unzoomed picture, whose size is passed. Pass a stable function (for
   * example with `useCallback`): a new one redraws.
   */
  readonly draw: (context: CanvasRenderingContext2D, size: CanvasSize) => void;
  /**
   * Called on click with the pointer position as fractions (0..1) of the
   * picture, and the picture's displayed width in CSS pixels (zoom included).
   */
  readonly onPointer?:
    ((fractionX: number, fractionY: number, cssWidth: number) => void) | undefined;
  /** Called as the pointer moves over the picture, and with no arguments when it leaves. */
  readonly onHover?:
    ((fractionX?: number, fractionY?: number, cssWidth?: number) => void) | undefined;
  /** Accessible description of the picture. */
  readonly label: string;
  /**
   * `width` (default): the canvas fills its container's width and takes its
   * height from the aspect. `contain`: it fills its container, and the picture
   * is as large as fits, centred.
   */
  readonly fit?: 'width' | 'contain' | undefined;
  /** Allow zooming with the wheel and panning by dragging. Only with `fit="contain"`. */
  readonly zoomable?: boolean | undefined;
  readonly handleRef?: Ref<CanvasSurfaceHandle> | undefined;
  /** Called whenever zoom or pan change. */
  readonly onCameraChange?: ((camera: Camera) => void) | undefined;
}

const HOME: Camera = { zoom: 1, x: 0, y: 0 };
const MIN_ZOOM = 1;
const MAX_ZOOM = 40;
/** A press that moves less than this (CSS px) is a click, not a drag. */
const DRAG_SLOP = 4;

interface Box {
  readonly width: number;
  readonly height: number;
}

/** Where the unzoomed picture sits in the surface: its size and top-left corner. */
function fitted(
  box: Box,
  aspect: number,
  fit: 'width' | 'contain',
): Box & { x: number; y: number } {
  if (fit === 'width') return { width: box.width, height: box.width * aspect, x: 0, y: 0 };
  const width = Math.max(1, Math.min(box.width, box.height / aspect));
  const height = width * aspect;
  return { width, height, x: (box.width - width) / 2, y: (box.height - height) / 2 };
}

/**
 * A canvas that shows a picture of a given aspect, matches the device pixel
 * ratio and redraws on frames and resizes. With `fit="contain"` and
 * `zoomable` it can be zoomed with the wheel (or buttons, through
 * `handleRef`) and panned by dragging; a double click shows it whole again.
 * Does nothing when the browser cannot give it a 2D context (as in jsdom).
 */
export function CanvasSurface({
  aspect,
  frame,
  draw,
  onPointer,
  onHover,
  label,
  fit = 'width',
  zoomable = false,
  handleRef,
  onCameraChange,
}: CanvasSurfaceProps): ReactElement {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState<Box>({ width: 0, height: 0 });
  const [camera, setCameraState] = useState<Camera>(HOME);
  const [dragging, setDragging] = useState(false);
  const cameraRef = useRef(camera);
  const press = useRef<{ x: number; y: number; camera: Camera; dragged: boolean } | undefined>(
    undefined,
  );
  const canZoom = zoomable && fit === 'contain';
  const theme = useThemeVersion();
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const picture = fitted(box, safeAspect, fit);

  const setCamera = useCallback(
    (next: Camera) => {
      cameraRef.current = next;
      setCameraState(next);
      onCameraChange?.(next);
    },
    [onCameraChange],
  );

  /** Zooms by a factor keeping the surface point (sx, sy) still. */
  const zoomAt = useCallback(
    (factor: number, sx: number, sy: number) => {
      const current = cameraRef.current;
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom * factor));
      if (zoom === MIN_ZOOM) {
        setCamera(HOME);
        return;
      }
      const ox = picture.x + current.x;
      const oy = picture.y + current.y;
      const u = (sx - ox) / current.zoom;
      const v = (sy - oy) / current.zoom;
      setCamera({ zoom, x: sx - picture.x - u * zoom, y: sy - picture.y - v * zoom });
    },
    [picture.x, picture.y, setCamera],
  );

  useImperativeHandle(
    handleRef,
    () => ({
      zoomBy: (factor) => zoomAt(factor, box.width / 2, box.height / 2),
      reset: () => setCamera(HOME),
      get camera() {
        return cameraRef.current;
      },
      get canvas() {
        return canvasRef.current;
      },
    }),
    [zoomAt, box.width, box.height, setCamera],
  );

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = (width: number, height: number): void =>
      setBox((previous) =>
        previous.width === Math.floor(width) && previous.height === Math.floor(height)
          ? previous
          : { width: Math.floor(width), height: Math.floor(height) },
      );
    measure(wrap.clientWidth, wrap.clientHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) measure(rect.width, rect.height);
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  // Wheel zoom needs a listener that may call preventDefault.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canZoom) return;
    const wheel = (event: WheelEvent): void => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.002));
      zoomAt(factor, event.clientX - rect.left, event.clientY - rect.top);
    };
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => canvas.removeEventListener('wheel', wheel);
  }, [canZoom, zoomAt]);

  const surfaceWidth = box.width;
  const surfaceHeight = fit === 'contain' ? box.height : Math.round(picture.height);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || surfaceWidth < 1 || surfaceHeight < 1) return;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const pixelWidth = Math.round(surfaceWidth * dpr);
    const pixelHeight = Math.round(Math.max(1, surfaceHeight) * dpr);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    const zoom = canZoom ? camera.zoom : 1;
    const x = picture.x + (canZoom ? camera.x : 0);
    const y = picture.y + (canZoom ? camera.y : 0);
    context.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * x, dpr * y);
    draw(context, { width: picture.width, height: picture.height, zoom });
  }, [
    draw,
    frame,
    surfaceWidth,
    surfaceHeight,
    picture.x,
    picture.y,
    picture.width,
    picture.height,
    camera,
    canZoom,
    theme,
  ]);

  /** The pointer as fractions of the picture, and the picture's on-screen width. */
  const locate = (clientX: number, clientY: number): [number, number, number] | undefined => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return undefined;
    if (fit === 'width') {
      return [(clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height, rect.width];
    }
    const zoom = canZoom ? camera.zoom : 1;
    const ox = picture.x + (canZoom ? camera.x : 0);
    const oy = picture.y + (canZoom ? camera.y : 0);
    const fx = (clientX - rect.left - ox) / (picture.width * zoom);
    const fy = (clientY - rect.top - oy) / (picture.height * zoom);
    return [fx, fy, picture.width * zoom];
  };

  const cursor = dragging ? 'grabbing' : onPointer ? 'crosshair' : canZoom ? 'grab' : undefined;

  return (
    <div
      className={fit === 'contain' ? 'ms-canvas-wrap ms-canvas-contain' : 'ms-canvas-wrap'}
      ref={wrapRef}
    >
      <canvas
        ref={canvasRef}
        className="ms-canvas"
        role="img"
        aria-label={label}
        data-zoom={canZoom ? camera.zoom.toFixed(2) : undefined}
        style={
          fit === 'contain'
            ? { width: '100%', height: '100%', cursor, touchAction: canZoom ? 'none' : undefined }
            : { aspectRatio: `1 / ${safeAspect}` }
        }
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          press.current = { x: event.clientX, y: event.clientY, camera, dragged: false };
          if (canZoom) event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const held = press.current;
          if (held && canZoom) {
            const dx = event.clientX - held.x;
            const dy = event.clientY - held.y;
            if (held.dragged || Math.hypot(dx, dy) > DRAG_SLOP) {
              if (!held.dragged) setDragging(true);
              held.dragged = true;
              setCamera({
                zoom: held.camera.zoom,
                x: held.camera.x + dx,
                y: held.camera.y + dy,
              });
              return;
            }
          }
          if (!held && onHover) {
            const at = locate(event.clientX, event.clientY);
            if (at && at[0] >= 0 && at[0] < 1 && at[1] >= 0 && at[1] < 1) onHover(...at);
            else onHover();
          }
        }}
        onPointerUp={(event) => {
          const held = press.current;
          press.current = undefined;
          if (held?.dragged) {
            setDragging(false);
            return;
          }
          if (!onPointer) return;
          const at = locate(event.clientX, event.clientY);
          if (at) onPointer(...at);
        }}
        onPointerCancel={() => {
          press.current = undefined;
          setDragging(false);
        }}
        onPointerLeave={() => {
          if (!press.current) onHover?.();
        }}
        onDoubleClick={canZoom ? () => setCamera(HOME) : undefined}
      />
    </div>
  );
}
