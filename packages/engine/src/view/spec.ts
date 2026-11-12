// SPDX-License-Identifier: EPL-2.0
import type { Agent } from '../agent';
import type { Scape } from '../scape';
import type { ContinuousScape } from '../space/continuous/continuous-scape';
import type { PointAgent } from '../space/continuous/point-agent';
import type { Cell } from '../space/grid/cell';
import type { GridScape } from '../space/grid/grid-scape';
import type { Occupant } from '../space/grid/occupant';
import type { Network } from '../space/network/network';
import type { Color } from './color';

/*
 * View specifications describe how a running simulation should be shown,
 * without depending on any UI technology. A model returns them from
 * `Model.views`; a front end (such as @metascape/react) renders them. The
 * functions in a spec are called for each agent on every redraw, so they
 * should be cheap and must not change the simulation.
 */

interface ViewBase {
  readonly title: string;
}

/** A lattice drawn from above: each cell coloured, with occupants on top. */
export interface GridViewSpec<
  C extends Cell = Cell,
  O extends Occupant<C> = Occupant<C>,
> extends ViewBase {
  readonly type: 'grid';
  readonly grid: GridScape<C>;
  /** Colour of each cell. Default: the background. */
  readonly cellColor?: (cell: C) => Color;
  /** Colour of each occupant; `undefined` hides it. Default: occupants are not drawn. */
  readonly occupantColor?: (occupant: O) => Color | undefined;
  /** Default `circle`. */
  readonly occupantShape?: 'circle' | 'square';
  readonly background?: Color;
}

/** Agents drawn at their positions in a continuous space. */
export interface ContinuousViewSpec<A extends PointAgent = PointAgent> extends ViewBase {
  readonly type: 'continuous';
  readonly scape: ContinuousScape<A>;
  readonly color?: (agent: A) => Color;
  /** Radius in space units. Default 1. */
  readonly radius?: (agent: A) => number;
  /** Direction in radians; when given, agents are drawn as pointers facing that way. */
  readonly heading?: (agent: A) => number | undefined;
  readonly background?: Color;
}

/** The members of a scape drawn as nodes, with the links of a network between them. */
export interface NetworkViewSpec<A extends Agent = Agent> extends ViewBase {
  readonly type: 'network';
  readonly nodes: Scape<A>;
  readonly network: Network<A>;
  readonly color?: (agent: A) => Color;
  /** Default `circle`: nodes evenly spaced on a circle in membership order. */
  readonly layout?: 'circle' | 'force';
  readonly background?: Color;
}

/** Recorded series plotted against time. */
export interface TimeSeriesViewSpec extends ViewBase {
  readonly type: 'timeSeries';
  /** Ids of series in `sim.data`, for example `wealth.mean`. */
  readonly series: readonly string[];
  /** Colour per series id. Default: a standard palette in order. */
  readonly colors?: Readonly<Record<string, Color>>;
  readonly yMin?: number;
  readonly yMax?: number;
}

/** The latest values of several series compared as bars. */
export interface BarsViewSpec extends ViewBase {
  readonly type: 'bars';
  readonly series: readonly string[];
  readonly colors?: Readonly<Record<string, Color>>;
}

/** The latest sample of a distribution declared with `sim.data.distribution`. */
export interface HistogramViewSpec extends ViewBase {
  readonly type: 'histogram';
  /** Name of the distribution in `sim.data`. */
  readonly distribution: string;
  readonly color?: Color;
}

/** Any view a model can ask for. */
export type ViewSpec =
  | GridViewSpec
  | ContinuousViewSpec
  | NetworkViewSpec
  | TimeSeriesViewSpec
  | BarsViewSpec
  | HistogramViewSpec;

/*
 * The helpers below let a model write a spec against its own agent classes
 * and still return a plain `ViewSpec`. The cast is safe in practice because a
 * spec's functions are only ever called with members of the spec's own scape.
 */

/** A grid view, typed by the model's own cell and occupant classes. */
export function gridView<C extends Cell, O extends Occupant<C> = Occupant<C>>(
  spec: Omit<GridViewSpec<C, O>, 'type'>,
): ViewSpec {
  return { type: 'grid', ...spec } as unknown as ViewSpec;
}

/** A continuous-space view, typed by the model's own agent class. */
export function continuousView<A extends PointAgent>(
  spec: Omit<ContinuousViewSpec<A>, 'type'>,
): ViewSpec {
  return { type: 'continuous', ...spec } as unknown as ViewSpec;
}

/** A network view, typed by the model's own agent class. */
export function networkView<A extends Agent>(spec: Omit<NetworkViewSpec<A>, 'type'>): ViewSpec {
  return { type: 'network', ...spec } as unknown as ViewSpec;
}

/** A time-series chart of recorded series. */
export function timeSeriesView(spec: Omit<TimeSeriesViewSpec, 'type'>): ViewSpec {
  return { type: 'timeSeries', ...spec };
}

/** A bar chart of the latest values of recorded series. */
export function barsView(spec: Omit<BarsViewSpec, 'type'>): ViewSpec {
  return { type: 'bars', ...spec };
}

/** A histogram of a recorded distribution. */
export function histogramView(spec: Omit<HistogramViewSpec, 'type'>): ViewSpec {
  return { type: 'histogram', ...spec };
}
