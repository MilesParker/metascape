// SPDX-License-Identifier: EPL-2.0
export { AgentInspector, type AgentInspectorProps } from './agent-inspector';
export { CanvasSurface, type CanvasSize, type CanvasSurfaceProps } from './canvas-surface';
export { ContinuousView, type ContinuousViewProps } from './continuous-view';
export { decimate, decimateIndices, MAX_POINTS, type DecimatedData } from './decimate';
export {
  cellAtFraction,
  GridView,
  packColor,
  paintGrid,
  type GridViewProps,
  type PaintGridOptions,
} from './grid-view';
export {
  choiceOf,
  NO_CUSTOMIZATIONS,
  seriesGrid,
  shownViews,
  type AddedChart,
  type ChartChoice,
  type ChartCustomizations,
  type SeriesGrid,
  type ShownView,
} from './chart-customization';
export { ChartCustomizer, type ChartCustomizerProps } from './chart-customizer';
export { useRunner, useRunnerState, type RunnerSnapshot } from './hooks';
export { ModelRunner, ProvenanceNote, type ModelRunnerProps } from './model-runner';
export { NetworkView, type NetworkViewProps } from './network-view';
export { DEFAULT_PALETTE } from './palette';
export { ParameterForm, type FormValue, type ParameterFormProps } from './parameter-form';
export { RulesPanel, type RulesPanelProps } from './rules-panel';
export {
  positionToSpeed,
  RunControls,
  speedToPosition,
  type RunControlsProps,
} from './run-controls';
export {
  SimulationViews,
  ViewPanel,
  type SimulationViewsProps,
  type ViewPanelProps,
} from './simulation-views';
export {
  BarsChart,
  formatValue,
  HistogramChart,
  type BarsChartProps,
  type HistogramChartProps,
} from './svg-charts';
export { TimeSeriesChart, type TimeSeriesChartProps } from './time-series-chart';
