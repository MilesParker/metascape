// SPDX-License-Identifier: EPL-2.0
import { toCss, type Agent, type ViewSpec } from '@metascape/engine';
import {
  continuousAspect,
  historyDepth,
  inspectorRows,
  legendOf,
  shownViews,
  timeUnit,
  ViewBody,
  ViewBoundary,
  type CanvasSurfaceHandle,
} from '@metascape/react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactElement, type RefObject } from 'react';
import { cn } from '../lib/cn';
import { Button } from '../ui/button';
import { Tip } from '../ui/primitives';
import { ChartCard, splitViews } from './ChartDock';
import type { Session } from './session';
import { useWorkbench } from './store';

/** The shape (height over width) a view needs on screen. */
export function viewAspect(spec: ViewSpec): number {
  switch (spec.type) {
    case 'grid':
      return spec.grid.height === 1
        ? historyDepth(spec.grid.width) / spec.grid.width
        : spec.grid.height / spec.grid.width;
    case 'continuous':
      return continuousAspect(spec);
    case 'network':
      return 1;
    default:
      return 0.6;
  }
}

/** How many columns tile views of these shapes into a box best: the smallest view as large as it can be. */
export function bestColumns(
  aspects: readonly number[],
  width: number,
  height: number,
  header = 32,
): number {
  const n = aspects.length;
  let best = 1;
  let bestScore = -1;
  for (let columns = 1; columns <= n; columns++) {
    const rows = Math.ceil(n / columns);
    const cellWidth = width / columns;
    const cellHeight = height / rows - header;
    let score = Infinity;
    for (const aspect of aspects) {
      const w = Math.max(0, Math.min(cellWidth, cellHeight / aspect));
      score = Math.min(score, w * w * aspect);
    }
    if (score > bestScore * 1.02) {
      best = columns;
      bestScore = score;
    }
  }
  return best;
}

/** A readable name for an agent or cell. */
export function agentTitle(agent: Agent): string {
  let scape: string;
  try {
    scape = agent.scape.name;
  } catch {
    scape = '';
  }
  const record = agent as unknown as { x?: unknown; y?: unknown; cell?: unknown };
  const isCell =
    typeof record.x === 'number' && typeof record.y === 'number' && !('cell' in record);
  if (isCell && Number.isInteger(record.x) && Number.isInteger(record.y)) {
    return `${scape || 'Cell'} (${String(record.x)}, ${String(record.y)})`;
  }
  return `${scape || 'Agent'} #${agent.id}`;
}

function useSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** What the colours of a view mean, when the model says. */
function Legend({ spec }: { readonly spec: ViewSpec }): ReactElement | null {
  const legend = useMemo(() => legendOf(spec), [spec]);
  if (!legend?.declared) return null;
  return (
    <ul className="max-h-full min-w-0 space-y-1 overflow-auto p-2 text-xs scrollbar-thin">
      {legend.entries.map((entry, i) => (
        <li key={i} className="flex items-center gap-2">
          <span
            className={cn(
              'size-3 shrink-0 border border-line-strong',
              entry.mark === 'agent' ? 'rounded-full' : 'rounded-[3px]',
            )}
            style={{ background: toCss(entry.color) }}
          />
          <span className="min-w-0 flex-1 text-pretty">
            {entry.label ?? (entry.mark === 'agent' ? 'Agents' : 'Cells')}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Whether the legend goes beside the picture (wide boxes) or under it. */
function legendSide(spec: ViewSpec, box: { width: number; height: number }): 'right' | 'bottom' {
  if (box.width === 0 || box.height === 0) return 'right';
  return box.width / box.height >= 1 / viewAspect(spec) ? 'right' : 'bottom';
}

/** One view of the world: its title, the picture, and its legend beside it. */
function StageTile({
  session,
  spec,
  index,
  stageRef,
  focused,
  canFocus,
}: {
  readonly session: Session;
  readonly spec: ViewSpec;
  readonly index: number;
  readonly stageRef: RefObject<HTMLDivElement | null>;
  readonly focused: boolean;
  readonly canFocus: boolean;
}): ReactElement {
  const { sim, frame } = session;
  const handle = useRef<CanvasSurfaceHandle>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const boxRef = useRef<HTMLDivElement>(null);
  const box = useSize(boxRef);
  const [zoomed, setZoomed] = useState(false);
  const selection = useWorkbench((state) => state.selection);
  const setFocusView = useWorkbench((state) => state.setFocusView);
  const spatial = spec.type === 'grid' || spec.type === 'continuous' || spec.type === 'network';
  const hasLegend = spatial && 'legend' in spec && (spec.legend?.length ?? 0) > 0;
  const side = legendSide(spec, box);
  const selected = selection?.sim === sim ? selection.agent : undefined;

  const relative = (): { x: number; y: number } => {
    const rect = stageRef.current?.getBoundingClientRect();
    return rect
      ? { x: pointer.current.x - rect.left, y: pointer.current.y - rect.top }
      : { x: 0, y: 0 };
  };

  return (
    <section
      aria-label={spec.title}
      className="relative flex min-h-0 min-w-0 flex-col"
      // Capture, so the position is known before the picture reports what is under it.
      onPointerMoveCapture={(event) => {
        pointer.current = { x: event.clientX, y: event.clientY };
      }}
    >
      <header className="flex h-8 shrink-0 items-center gap-1 px-2">
        <h3 className="min-w-0 flex-1 truncate text-xs font-medium text-muted" title={spec.title}>
          {spec.title}
          {spec.type === 'grid' && spec.grid.height === 1 && (
            <span className="ml-2 text-faint">· one row per {timeUnit(sim).singular}</span>
          )}
        </h3>
        {zoomed && (
          <Tip label="Show the whole view (double-click)">
            <Button variant="ghost" size="sm" onClick={() => handle.current?.reset()}>
              Fit
            </Button>
          </Tip>
        )}
        {canFocus && (
          <Tip label={focused ? 'Show all views' : 'Show this view alone'}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={focused ? 'Show all views' : `Show ${spec.title} alone`}
              onClick={() => setFocusView(focused ? undefined : index)}
            >
              {focused ? <Minimize2 /> : <Maximize2 />}
            </Button>
          </Tip>
        )}
      </header>
      <div
        ref={boxRef}
        className={cn(
          'flex min-h-0 flex-1',
          hasLegend && side === 'bottom' ? 'flex-col' : 'flex-row',
        )}
      >
        <div className="relative min-h-0 min-w-0 flex-1">
          <ViewBoundary>
            {spatial ? (
              <ViewBody
                spec={spec}
                sim={sim}
                frame={frame}
                fit="contain"
                zoomable
                handleRef={handle}
                onCameraChange={(camera) => setZoomed(camera.zoom > 1.001)}
                selected={selected}
                onPick={(agent) => useWorkbench.getState().select({ sim, agent })}
                onHover={(agent) =>
                  useWorkbench.getState().setHover(agent ? { agent, ...relative() } : undefined)
                }
              />
            ) : null}
          </ViewBoundary>
        </div>
        {hasLegend && (
          <div
            className={cn(
              'shrink-0',
              side === 'right' ? 'w-[min(200px,30%)] self-start' : 'max-h-[30%] w-full',
            )}
          >
            <Legend spec={spec} />
          </div>
        )}
      </div>
    </section>
  );
}

/** A small read-out of the agent or cell under the pointer. */
function HoverCard({
  session,
  bounds,
}: {
  readonly session: Session;
  readonly bounds: { width: number; height: number };
}): ReactElement | null {
  const hover = useWorkbench((state) => state.hover);
  if (!hover) return null;
  const rows = inspectorRows(hover.agent, session.model.fields)
    .filter((r) => r.key !== 'alive')
    .slice(0, 5);
  // Beside the pointer, flipped to the other side near the edges so it is never clipped.
  const width = 208;
  const height = 24 + rows.length * 18 + 20;
  const left = hover.x + 14 + width > bounds.width ? hover.x - 14 - width : hover.x + 14;
  const top = hover.y + 14 + height > bounds.height ? hover.y - 14 - height : hover.y + 14;
  return (
    <div
      className="pointer-events-none absolute z-20 w-52 rounded-md border border-line bg-raised/95 px-2.5 py-2 text-xs shadow-pop backdrop-blur"
      style={{ left: Math.max(4, left), top: Math.max(4, top) }}
    >
      <p className="mb-1 font-medium">{agentTitle(hover.agent)}</p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
        {rows.map((row) => (
          <div key={row.key} className="contents">
            <dt className="truncate text-muted">{row.label}</dt>
            <dd className="text-right font-mono tnum">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The live fields of the selected agent or cell, as a table. */
export function InspectorBody({
  session,
  agent,
}: {
  readonly session: Session;
  readonly agent: Agent;
}): ReactElement {
  // Whether it is still in the run shows as the note below, not as a row
  // that reads like the model's own fields (a Life cell's "alive", say).
  const rows = inspectorRows(agent, session.model.fields).filter((row) => row.key !== 'alive');
  return (
    <>
      {!agent.alive && (
        <p className="mb-2 rounded bg-warn-soft px-2 py-1 text-2xs">Gone; last values shown.</p>
      )}
      <table className="w-full text-xs" data-frame={session.frame}>
        <caption className="sr-only">{agentTitle(agent)}</caption>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-line/50 last:border-0">
              <th scope="row" className="py-1 pr-3 text-left font-normal text-muted">
                {row.label}
              </th>
              <td className="py-1 text-right font-mono tnum">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/**
 * The world, as large as it can be: spatial views tiled to suit their shapes
 * (or charts, for a model with nothing spatial), with the hover read-out.
 */
export function Stage({ session }: { readonly session: Session }): ReactElement {
  const { sim } = session;
  const stageRef = useRef<HTMLDivElement>(null);
  const size = useSize(stageRef);
  const focusView = useWorkbench((state) => state.focusView);
  const views = useMemo(() => sim.views, [sim]);
  const { stage } = splitViews(views);
  const chartsOnly =
    stage.length > 0 &&
    !stage.some((i) => {
      const t = views[i]!.type;
      return t === 'grid' || t === 'continuous' || t === 'network';
    });
  const shown =
    focusView !== undefined && stage.includes(stage[focusView] ?? -1) ? [stage[focusView]!] : stage;
  const aspects = shown.map((i) => viewAspect(views[i]!));
  const columns = chartsOnly
    ? Math.max(1, Math.min(shown.length, Math.floor(size.width / 420) || 1))
    : bestColumns(aspects, size.width, size.height);
  const chartViews = useMemo(
    () => (chartsOnly ? shownViews(views, session.charts, sim) : []),
    [chartsOnly, views, session.charts, sim],
  );

  return (
    <div
      ref={stageRef}
      data-stage
      className="relative h-full min-h-0 overflow-hidden bg-stage"
      onPointerLeave={() => useWorkbench.getState().setHover(undefined)}
    >
      {chartsOnly ? (
        <div
          className="grid h-full auto-rows-[minmax(220px,1fr)] gap-2 overflow-auto p-2 scrollbar-thin"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {chartViews.map((view) => (
            <ChartCard
              key={view.position !== undefined ? `m${view.position}` : `a${view.addedIndex}`}
              session={session}
              view={view}
            />
          ))}
        </div>
      ) : (
        <div
          className="grid h-full gap-px p-1"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${Math.ceil(shown.length / columns)}, minmax(0, 1fr))`,
          }}
        >
          {shown.map((viewIndex) => (
            <StageTile
              key={viewIndex}
              session={session}
              spec={views[viewIndex]!}
              index={stage.indexOf(viewIndex)}
              stageRef={stageRef}
              focused={focusView !== undefined}
              canFocus={stage.length > 1}
            />
          ))}
        </div>
      )}
      <HoverCard session={session} bounds={size} />
    </div>
  );
}
