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
}

/** Props of {@link SimulationViews}. */
export interface SimulationViewsProps {
  readonly sim: Simulation;
  /** Changes on each frame to trigger redraws. */
  readonly frame: number;
  readonly onPick?: ((agent: Agent) => void) | undefined;
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
      <h3 className="ms-panel-title" id={titleId}>
        {props.spec.title}
      </h3>
      <ViewBoundary>
        <ViewBody {...props} />
      </ViewBoundary>
    </section>
  );
}

/**
 * Asks the model for its views once per simulation and shows them in a
 * responsive grid of titled panels.
 */
export function SimulationViews({ sim, frame, onPick }: SimulationViewsProps): ReactElement {
  const result = useMemo(() => {
    try {
      return { specs: sim.views, error: undefined };
    } catch (error) {
      return { specs: [], error: error instanceof Error ? error.message : String(error) };
    }
  }, [sim]);

  if (result.error !== undefined) {
    return (
      <p className="ms-error" role="alert">
        The model could not describe its views: {result.error}
      </p>
    );
  }
  if (result.specs.length === 0) {
    return <p className="ms-muted">This model has no views.</p>;
  }
  return (
    <div className="ms-views">
      {result.specs.map((spec, i) => (
        <ViewPanel key={`${i}:${spec.title}`} spec={spec} sim={sim} frame={frame} onPick={onPick} />
      ))}
    </div>
  );
}
