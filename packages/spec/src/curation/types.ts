// SPDX-License-Identifier: EPL-2.0
//
// Curation: what to look at in a model, separate from the model itself (R24
// in docs/metamodel-review.md). MetaABM had no counterpart; AMP's tools
// charted what a model gathered. A curation names the measures worth
// watching and the charts to draw, in terms of the model's own agents and
// attributes.

import type { AgentId } from '../metamodel/types';
import type { Measurement } from '../runspec/types';

/** The version of the curation format described here. */
export const CURATION_SCHEMA_VERSION = 1;

/** One line of a chart: a measure, and the name to show for it. */
export interface ChartSeries extends Measurement {
  /** Default: from the labels of the model (`Count(Individual.Status=Dead)` is "Dead"). */
  label?: string | undefined;
}

/** A chart of measures over the periods of a run. */
export interface Chart {
  title: string;
  series: ChartSeries[];
  yMin?: number | undefined;
  yMax?: number | undefined;
  /** What the y axis measures, such as "individuals". */
  yLabel?: string | undefined;
}

/** What to look at in a model. */
export interface Curation {
  schemaVersion: typeof CURATION_SCHEMA_VERSION;
  /** The ID of the model it is about (the model's root scape). */
  model: AgentId;
  /**
   * Measures worth watching besides those charted. They, and every series of
   * the charts, are recorded as the model runs, whether or not the model
   * gathers the attributes they are of; the model runs as it did.
   */
  measures?: Measurement[] | undefined;
  charts?: Chart[] | undefined;
}
