// SPDX-License-Identifier: EPL-2.0
import type { Agent, Simulation, ViewSpec } from '@metascape/engine';
import {
  Component,
  useId,
  useMemo,
  type ErrorInfo,
  type ReactElement,
  type ReactNode,
} from 'react';
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
import { TimeSeriesChart } from './time-series-chart';

/** Props of {@link ViewPanel}. */
export interface ViewPanelProps {
  readonly spec: ViewSpec;
  readonly sim: Simulation;
  /** Changes on each frame to trigger redraws. */
  readonly frame: number;
  /** Called when the user clicks an agent or cell (a cell's occupant is preferred). */
  readonly onPick?: ((agent: Agent) => void) | undefined;
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
class ViewBoundary extends Component<BoundaryProps, BoundaryState> {
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

/** The component for one view spec, chosen by its type. */
function ViewBody({ spec, sim, frame, onPick }: ViewPanelProps): ReactElement {
  switch (spec.type) {
    case 'grid':
      return (
        <GridView
          spec={spec}
          frame={frame}
          onPick={onPick && ((cell, occupant) => onPick(occupant ?? cell))}
        />
      );
    case 'continuous':
      return <ContinuousView spec={spec} frame={frame} onPick={onPick} />;
    case 'network':
      return <NetworkView spec={spec} frame={frame} onPick={onPick} />;
    case 'timeSeries':
      return <TimeSeriesChart spec={spec} sim={sim} frame={frame} />;
    case 'bars':
      return <BarsChart spec={spec} sim={sim} frame={frame} />;
    case 'histogram':
      return <HistogramChart spec={spec} sim={sim} frame={frame} />;
  }
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
