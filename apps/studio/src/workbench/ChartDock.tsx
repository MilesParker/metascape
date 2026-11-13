// SPDX-License-Identifier: EPL-2.0
import { timeAt, type Simulation, type ViewSpec } from '@metascape/engine';
import {
  choiceOf,
  humanize,
  isCustomizable,
  isSpatial,
  seriesGrid,
  seriesLabel,
  shownViews,
  timeUnit,
  toggled,
  ViewBody,
  ViewBoundary,
  withAddedChoice,
  withChange,
  withNewChart,
  withoutAdded,
  type ChartChoice,
  type ShownView,
} from '@metascape/react';
import { BarChart3, Download, LineChart, Plus } from 'lucide-react';
import { useMemo, type ReactElement } from 'react';
import { cn } from '../lib/cn';
import { Button } from '../ui/button';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Segmented,
  Switch,
  Tip,
} from '../ui/primitives';
import type { Session } from './session';
import { useWorkbench } from './store';

const STATISTICS: Readonly<Record<string, string>> = {
  count: 'Count',
  sum: 'Sum',
  mean: 'Mean',
  min: 'Min',
  max: 'Max',
  variance: 'Var',
  stdDev: 'SD',
  value: 'Value',
};

/** Saves text as a file in the browser's downloads. */
export function download(name: string, content: Blob | string, type = 'text/csv'): void {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The recorded series of a chart as CSV, with the model's time beside each tick. */
export function chartCsv(sim: Simulation, ids: readonly string[]): string {
  const unit = timeUnit(sim).singular;
  const header = [
    'tick',
    ...(sim.model.time ? [unit] : []),
    ...ids.map((id) => seriesLabel(sim, id)),
  ];
  const quote = (text: string): string =>
    /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  const lines = [header.map(quote).join(',')];
  const columns = ids.map((id) => sim.data.values(id));
  for (let i = 0; i < sim.data.sampleCount; i++) {
    const tick = sim.data.ticks[i]!;
    lines.push(
      [tick, ...(sim.model.time ? [timeAt(sim, tick)] : []), ...columns.map((c) => c[i])].join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

/** A chart's one control: what it shows (its type and series) and its data as CSV. */
function ChartMenu({
  session,
  view,
}: {
  readonly session: Session;
  readonly view: ShownView;
}): ReactElement | null {
  const { sim, charts, setCharts, entry } = session;
  const spec = view.spec;
  const ids = 'series' in spec ? spec.series : [];
  const customizable = isCustomizable(spec);
  if (!customizable && ids.length === 0) return null;
  const saveCsv = (): void =>
    download(
      `${entry.id}-${spec.title.replace(/\W+/g, '-').toLowerCase()}.csv`,
      chartCsv(sim, ids),
    );
  if (!customizable) {
    return (
      <Tip label="Download as CSV">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Download ${spec.title} as CSV`}
          onClick={saveCsv}
        >
          <Download />
        </Button>
      </Tip>
    );
  }
  const choice = choiceOf(spec);
  const grid = seriesGrid(sim.data.series);
  const shown = new Set(choice.series);
  const change = (next: ChartChoice): void =>
    setCharts(
      view.position !== undefined
        ? withChange(charts, view.position, next)
        : withAddedChoice(charts, view.addedIndex ?? 0, next),
    );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-muted"
          aria-label={`Series of ${spec.title}`}
        >
          Series
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,420px)] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted">Show as</span>
          <Segmented
            label="Chart type"
            value={choice.type}
            onChange={(type) => change({ ...choice, type })}
            options={[
              {
                value: 'timeSeries',
                label: (
                  <>
                    <LineChart /> Over time
                  </>
                ),
              },
              {
                value: 'bars',
                label: (
                  <>
                    <BarChart3 /> Latest values
                  </>
                ),
              },
            ]}
          />
        </div>
        <div className="max-h-72 overflow-auto rounded-md border border-line scrollbar-thin">
          <table className="w-full text-xs">
            <caption className="sr-only">Series shown in {spec.title}</caption>
            <thead className="sticky top-0 bg-raised">
              <tr className="border-b border-line">
                <th scope="col" className="px-2 py-1.5 text-left font-medium text-muted">
                  Measure
                </th>
                {grid.statistics.map((statistic) => (
                  <th key={statistic} scope="col" className="px-1.5 py-1.5 font-medium text-muted">
                    {STATISTICS[statistic] ?? statistic}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((row) => (
                <tr key={row.measure} className="border-b border-line/50 last:border-0">
                  <th scope="row" className="px-2 py-1 text-left font-normal">
                    {humanize(row.measure)}
                  </th>
                  {grid.statistics.map((statistic) => {
                    const series = row.byStatistic.get(statistic);
                    return (
                      <td key={statistic} className="text-center">
                        {series && (
                          <input
                            type="checkbox"
                            className="size-3.5 accent-[var(--accent)]"
                            aria-label={humanize(series.label)}
                            checked={shown.has(series.id)}
                            // A chart always keeps at least one series.
                            disabled={shown.has(series.id) && shown.size === 1}
                            onChange={(event) =>
                              change(toggled(choice, series.id, event.target.checked))
                            }
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-2">
          {ids.length > 0 && (
            <Button size="sm" onClick={saveCsv}>
              <Download /> CSV
            </Button>
          )}
          {view.customized && view.position !== undefined && (
            <Button
              size="sm"
              onClick={() => setCharts(withChange(charts, view.position!, undefined))}
            >
              Reset
            </Button>
          )}
          {view.addedIndex !== undefined && (
            <Button size="sm" onClick={() => setCharts(withoutAdded(charts, view.addedIndex!))}>
              Remove chart
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** One chart in a card: its title, its one control, and the chart filling the card. */
export function ChartCard({
  session,
  view,
  className,
}: {
  readonly session: Session;
  readonly view: ShownView;
  readonly className?: string;
}): ReactElement {
  const { sim, frame, entry } = session;
  const interventions = useWorkbench((state) => state.interventions);
  const ghost = useWorkbench((state) => state.ghost);
  const showGhost = useWorkbench((state) => state.showGhost);
  const spec = view.spec;
  const marks = useMemo(
    () => interventions.map((i) => ({ tick: i.tick, label: i.label })),
    [interventions],
  );
  return (
    <section
      aria-label={spec.title}
      className={cn(
        'flex min-h-0 min-w-0 flex-col rounded-lg border border-line bg-surface',
        className,
      )}
    >
      <header className="flex h-8 shrink-0 items-center gap-1 pr-1 pl-3">
        <h3 className="min-w-0 flex-1 truncate text-xs font-medium" title={spec.title}>
          {spec.title}
        </h3>
        <ChartMenu session={session} view={view} />
      </header>
      <div className={cn('min-h-0 flex-1 px-2 pb-2', spec.type === 'bars' && 'overflow-auto')}>
        <ViewBoundary>
          <ViewBody
            spec={spec}
            sim={sim}
            frame={frame}
            chart={{
              fill: true,
              syncKey: `charts:${entry.id}`,
              ghost: showGhost ? ghost : undefined,
              marks,
            }}
          />
        </ViewBoundary>
      </div>
    </section>
  );
}

/** The views a model gives, split into those for the stage and the charts beside it. */
export function splitViews(views: readonly ViewSpec[]): { stage: number[]; charts: number[] } {
  const stage: number[] = [];
  const charts: number[] = [];
  views.forEach((view, i) => {
    if (view.role === 'stage' || (view.role !== 'aside' && isSpatial(view))) stage.push(i);
    else charts.push(i);
  });
  // A model with nothing spatial puts its charts on the stage.
  if (stage.length === 0) return { stage: charts, charts: [] };
  return { stage, charts };
}

/** The menu that adds a chart of any recorded series. */
export function AddChart({ session }: { readonly session: Session }): ReactElement {
  const { sim, charts, setCharts } = session;
  const grid = seriesGrid(sim.data.series);
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button size="sm" variant="ghost">
          <Plus /> Add chart
        </Button>
      </MenuTrigger>
      <MenuContent className="max-h-80 overflow-auto scrollbar-thin">
        <MenuLabel>Series</MenuLabel>
        {grid.rows.flatMap((row) =>
          [...row.byStatistic.values()].map((series) => (
            <MenuItem key={series.id} onSelect={() => setCharts(withNewChart(charts, series.id))}>
              {humanize(series.label)}
            </MenuItem>
          )),
        )}
      </MenuContent>
    </Menu>
  );
}

/** The charts beside the stage, in a grid of cards that fills the dock. */
export function ChartDock({ session }: { readonly session: Session }): ReactElement {
  const { sim, charts } = session;
  const ghost = useWorkbench((state) => state.ghost);
  const showGhost = useWorkbench((state) => state.showGhost);
  const setShowGhost = useWorkbench((state) => state.setShowGhost);
  const views = useMemo(() => sim.views, [sim]);
  const { charts: chartIndexes } = splitViews(views);
  const shown = useMemo(
    () =>
      shownViews(views, charts, sim).filter(
        (v) => v.position === undefined || chartIndexes.includes(v.position),
      ),
    [views, charts, sim, chartIndexes],
  );
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="text-xs font-semibold tracking-wide text-faint uppercase">Charts</h2>
        <div className="ml-auto flex items-center gap-3">
          {ghost && (
            <label className="flex items-center gap-2 text-xs text-muted">
              <Switch
                checked={showGhost}
                onCheckedChange={setShowGhost}
                aria-label="Show the previous run"
              />
              Previous run
            </label>
          )}
          <AddChart session={session} />
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="p-6 text-muted">No charts.</p>
      ) : (
        <div className="grid min-h-0 flex-1 auto-rows-[minmax(190px,1fr)] grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-2 overflow-auto p-2 scrollbar-thin">
          {shown.map((view) => (
            <ChartCard
              key={view.position !== undefined ? `m${view.position}` : `a${view.addedIndex}`}
              session={session}
              view={view}
            />
          ))}
        </div>
      )}
    </div>
  );
}
