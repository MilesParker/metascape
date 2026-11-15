// SPDX-License-Identifier: EPL-2.0
export {
  AgentInspector,
  inspectorRows,
  type AgentInspectorProps,
  type InspectorRow,
} from './agent-inspector';
export {
  CanvasSurface,
  type Camera,
  type CanvasSize,
  type CanvasSurfaceHandle,
  type CanvasSurfaceProps,
} from './canvas-surface';
export {
  describeExecution,
  groupParameters,
  needsRandomOrder,
  rangePairs,
  useParameterController,
  useRulesController,
  validateParameter,
  type ParameterController,
  type ParameterControllerOptions,
  type ParameterInput,
  type RulesController,
  type ScapeRules,
} from './controllers';
export { describeTime, formatNumber, humanize, seriesLabel, timeUnit } from './labels';
export { legendOf, type Legend, type ShownLegendEntry } from './legend';
export { FALLBACK_ACCENT, readableOn, themeColor, useThemeVersion } from './theme';
export { continuousAspect, ContinuousView, type ContinuousViewProps } from './continuous-view';
export { decimate, decimateIndices, MAX_POINTS, type DecimatedData } from './decimate';
export {
  cellAtFraction,
  drawCellOutline,
  drawSelection,
  GridView,
  gridPositionOf,
  historyDepth,
  latticeOf,
  occupantsOf,
  packColor,
  paintGrid,
  type GridViewProps,
  type PaintGridOptions,
} from './grid-view';
export {
  choiceOf,
  isCustomizable,
  NO_CUSTOMIZATIONS,
  seriesGrid,
  shownViews,
  toggled,
  withAddedChoice,
  withChange,
  withNewChart,
  withoutAdded,
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
  isSpatial,
  registerView,
  ModelViews,
  ViewBody,
  ViewBoundary,
  ViewPanel,
  viewRenderer,
  type ChartViewOptions,
  type ModelViewsProps,
  type ViewPanelProps,
  type ViewRenderer,
  type ViewRendererProps,
} from './model-views';
export {
  BarsChart,
  formatValue,
  HistogramChart,
  type BarsChartProps,
  type HistogramChartProps,
} from './svg-charts';
export {
  ghostOf,
  seriesColors,
  TimeSeriesChart,
  type GhostRun,
  type TimeMark,
  type TimeSeriesChartProps,
} from './time-series-chart';
