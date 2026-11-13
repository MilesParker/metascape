// SPDX-License-Identifier: EPL-2.0
import type {
  Agent,
  BarsViewSpec,
  ContinuousViewSpec,
  GridViewSpec,
  HistogramViewSpec,
  NetworkViewSpec,
  Simulation,
  TimeSeriesViewSpec,
  ViewSpec,
} from '@metascape/engine';
import {
  Component,
  useId,
  useMemo,
  type ErrorInfo,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import type { Camera, CanvasSurfaceHandle } from './canvas-surface';
import { ChartCustomizer } from './chart-customizer';
import {
  choiceOf,
  isCustomizable,
  NO_CUSTOMIZATIONS,
  shownViews,
  withAddedChoice,
  withChange,
  withNewChart,
  withoutAdded,
  type ChartCustomizations,
} from './chart-customization';
import { ContinuousView } from './continuous-view';
import { GridView } from './grid-view';
import { NetworkView } from './network-view';
import { BarsChart, HistogramChart } from './svg-charts';
import { TimeSeriesChart, type GhostRun, type TimeMark } from './time-series-chart';

/** Options for charts drawn by the view registry. */
export interface ChartViewOptions {
  /** Take the height of the container. */
  readonly fill?: boolean | undefined;
  readonly syncKey?: string | undefined;
  readonly ghost?: GhostRun | undefined;
  readonly marks?: readonly TimeMark[] | undefined;
  readonly cursorTick?: number | undefined;
  readonly onCursorTick?: ((tick: number | undefined) => void) | undefined;
}

/** What every view renderer is given. */
export interface ViewRendererProps {
  readonly spec: ViewSpec;
  readonly sim: Simulation;
  /** Changes on each frame to trigger redraws. */
  readonly frame: number;
  /** Called when the user clicks an agent or cell (a cell's occupant is preferred). */
  readonly onPick?: ((agent: Agent) => void) | undefined;
  /** Called with the agent or cell under the pointer (occupant preferred), or nothing. */
  readonly onHover?: ((agent?: Agent) => void) | undefined;
  /** An agent or cell to mark. */
  readonly selected?: Agent | undefined;
  /** How a spatial view fills its box; `contain` with `zoomable` allows zoom and pan. */
  readonly fit?: 'width' | 'contain' | undefined;
  readonly zoomable?: boolean | undefined;
  readonly handleRef?: Ref<CanvasSurfaceHandle> | undefined;
  /** Called whenever a spatial view is zoomed or panned. */
  readonly onCameraChange?: ((camera: Camera) => void) | undefined;
  readonly chart?: ChartViewOptions | undefined;
}

/**
 * Draws one kind of view by returning an element (it is called as a plain
 * function, so it must not use hooks itself; the components it returns may).
 */
export type ViewRenderer = (props: ViewRendererProps) => ReactElement;

const renderers = new Map<string, ViewRenderer>();

/**
 * Registers the renderer for a view type, replacing any before it. The
 * built-in types are registered when this module loads; register a type again
 * to draw it differently (for example with WebGL).
 */
export function registerView(type: string, renderer: ViewRenderer): void {
  renderers.set(type, renderer);
}

/** The renderer registered for a view type. */
export function viewRenderer(type: string): ViewRenderer | undefined {
  return renderers.get(type);
}

/** Whether a view shows space (a lattice, a plane, a network) rather than data. */
export function isSpatial(spec: ViewSpec): boolean {
  return spec.type === 'grid' || spec.type === 'continuous' || spec.type === 'network';
}

const surface = (props: ViewRendererProps) => ({
  frame: props.frame,
  selected: props.selected,
  fit: props.fit,
  zoomable: props.zoomable,
  handleRef: props.handleRef,
  onCameraChange: props.onCameraChange,
});

registerView('grid', (props) => {
  const spec = props.spec as GridViewSpec;
  const { onPick, onHover } = props;
  return (
    <GridView
      spec={spec}
      sim={props.sim}
      {...surface(props)}
      onPick={onPick && ((cell, occupant) => onPick(occupant ?? cell))}
      onHover={onHover && ((cell, occupant) => onHover(occupant ?? cell))}
    />
  );
});
registerView('continuous', (props) => (
  <ContinuousView
    spec={props.spec as ContinuousViewSpec}
    {...surface(props)}
    onPick={props.onPick}
    onHover={props.onHover}
  />
));
registerView('network', (props) => (
  <NetworkView
    spec={props.spec as NetworkViewSpec}
    {...surface(props)}
    onPick={props.onPick}
    onHover={props.onHover}
  />
));
registerView('timeSeries', (props) => (
  <TimeSeriesChart
    spec={props.spec as TimeSeriesViewSpec}
    sim={props.sim}
    frame={props.frame}
    fill={props.chart?.fill}
    syncKey={props.chart?.syncKey}
    ghost={props.chart?.ghost}
    marks={props.chart?.marks}
    cursorTick={props.chart?.cursorTick}
    onCursorTick={props.chart?.onCursorTick}
  />
));
registerView('bars', (props) => (
  <BarsChart spec={props.spec as BarsViewSpec} sim={props.sim} frame={props.frame} />
));
registerView('histogram', (props) => (
  <HistogramChart spec={props.spec as HistogramViewSpec} sim={props.sim} frame={props.frame} />
));

/** Props of {@link ViewPanel}. */
export interface ViewPanelProps extends ViewRendererProps {
  /** Shown beside the title, for example a chart's Customize button. */
  readonly controls?: ReactNode;
}

/** Props of {@link SimulationViews}. */
export interface SimulationViewsProps {
  readonly sim: Simulation;
  /** Changes on each frame to trigger redraws. */
  readonly frame: number;
  readonly onPick?: ((agent: Agent) => void) | undefined;
  /**
   * The user's chart choices. Give both this and `onCustomizationsChange` to
   * let the user change which series each chart shows, add charts of any
   * recorded series and remove those they added. Keep the value across
   * restarts to keep their choices.
   */
  readonly customizations?: ChartCustomizations | undefined;
  readonly onCustomizationsChange?: ((next: ChartCustomizations) => void) | undefined;
}

interface BoundaryProps {
  readonly children: ReactNode;
}
interface BoundaryState {
  readonly message: string | undefined;
}

/** Keeps one broken view from taking the rest of the page down. */
export class ViewBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { message: undefined };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  override componentDidCatch(_error: unknown, _info: ErrorInfo): void {}

  override render(): ReactNode {
    if (this.state.message !== undefined) {
      return (
        <p className="ms-error" role="alert">
          This view failed: {this.state.message}
        </p>
      );
    }
    return this.props.children;
  }
}

/** The registered renderer for a view spec, or a note when there is none. */
export function ViewBody(props: ViewRendererProps): ReactElement {
  const render = renderers.get(props.spec.type);
  if (!render) return <p className="ms-muted">No renderer for “{props.spec.type}” views.</p>;
  return render(props);
}

/** A titled panel showing one view. */
export function ViewPanel(props: ViewPanelProps): ReactElement {
  const titleId = useId();
  return (
    <section className={`ms-panel ms-panel-${props.spec.type}`} aria-labelledby={titleId}>
      <div className="ms-panel-head">
        <h3 className="ms-panel-title" id={titleId}>
          {props.spec.title}
        </h3>
        {props.controls}
      </div>
      <ViewBoundary>
        <ViewBody {...props} />
      </ViewBoundary>
    </section>
  );
}

/**
 * Asks the model for its views once per simulation and shows them in a
 * responsive grid of titled panels. With `customizations`, time-series and bar
 * charts get a Customize control, and charts can be added and removed.
 */
export function SimulationViews({
  sim,
  frame,
  onPick,
  customizations,
  onCustomizationsChange,
}: SimulationViewsProps): ReactElement {
  const result = useMemo(() => {
    try {
      return { specs: sim.views, error: undefined };
    } catch (error) {
      return { specs: [], error: error instanceof Error ? error.message : String(error) };
    }
  }, [sim]);
  const editable = onCustomizationsChange !== undefined;
  const current = customizations ?? NO_CUSTOMIZATIONS;
  const shown = useMemo(() => shownViews(result.specs, current, sim), [result.specs, current, sim]);
  const update = (next: ChartCustomizations): void => onCustomizationsChange?.(next);

  if (result.error !== undefined) {
    return (
      <p className="ms-error" role="alert">
        The model could not describe its views: {result.error}
      </p>
    );
  }
  const recorded = sim.data.series;
  const addChart = editable && recorded.length > 0 && (
    <label className="ms-add-chart">
      <span className="ms-visually-hidden">Add chart from series</span>
      <select
        className="ms-select"
        value=""
        onChange={(event) => {
          if (event.target.value) update(withNewChart(current, event.target.value));
        }}
      >
        <option value="">Add chart…</option>
        {recorded.map((series) => (
          <option key={series.id} value={series.id}>
            {series.label}
          </option>
        ))}
      </select>
    </label>
  );
  if (shown.length === 0) {
    return (
      <>
        <p className="ms-muted">This model has no views.</p>
        {addChart}
      </>
    );
  }
  return (
    <>
      <div className="ms-views">
        {shown.map((view) => {
          const { spec, position, addedIndex } = view;
          const key = position !== undefined ? `${position}:${spec.title}` : `added:${addedIndex}`;
          let controls: ReactNode;
          if (editable && isCustomizable(spec)) {
            const original = position !== undefined ? result.specs[position] : undefined;
            controls = (
              <ChartCustomizer
                title={spec.title}
                recorded={recorded}
                choice={choiceOf(spec)}
                onChange={(choice) =>
                  update(
                    position !== undefined
                      ? withChange(current, position, choice)
                      : withAddedChoice(current, addedIndex ?? 0, choice),
                  )
                }
                onReset={
                  view.customized && position !== undefined && original
                    ? () => update(withChange(current, position, undefined))
                    : undefined
                }
                onRemove={
                  addedIndex !== undefined
                    ? () => update(withoutAdded(current, addedIndex))
                    : undefined
                }
              />
            );
          }
          return (
            <ViewPanel
              key={key}
              spec={spec}
              sim={sim}
              frame={frame}
              onPick={onPick}
              controls={controls}
            />
          );
        })}
      </div>
      {addChart}
    </>
  );
}
