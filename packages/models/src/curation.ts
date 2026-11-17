// SPDX-License-Identifier: EPL-2.0
//
// Models in the model format (@metascape/spec), compiled by its interpreter,
// with what the catalogue adds to them. That is not part of the model: the
// name the catalogue knows it by, its provenance, and what to look at
// (statistics and charts), until curation has a model of its own (R24).
import {
  timeSeriesView,
  type Model,
  type Provenance,
  type TimeSeriesViewSpec,
} from '@metascape/engine';
import {
  compileModel,
  parseModel,
  type Agent,
  type Scape,
  type AttributeRef,
  type Model as FormatModel,
} from '@metascape/spec';

export interface Curation {
  /** The name in the catalogue, from which Studio makes the model's address. Default: the model's label. */
  readonly name?: string;
  /** Default: the model's description. */
  readonly description?: string;
  readonly provenance?: Provenance;
  /**
   * Attributes to gather statistics on besides those the original gathers,
   * written as references from the root scape (`bug.size`). Their values are
   * only recorded; the model runs as it did.
   */
  readonly gather?: readonly AttributeRef[];
  /** Charts of the statistics. */
  readonly charts?: readonly Omit<TimeSeriesViewSpec, 'type'>[];
}

/** The agent or scape at a path from the root scape, such as `region.farmer`. */
function agentAt(model: FormatModel, path: readonly string[]): Agent | Scape | FormatModel {
  let found: Agent | Scape | FormatModel = model;
  for (const id of path) {
    const next: Agent | Scape | undefined = 'agents' in found ? found.agents?.[id] : undefined;
    if (!next) throw new Error(`${model.id} has no agent ${path.join('.')}`);
    found = next;
  }
  return found;
}

const STATISTICS: Readonly<Record<string, string>> = {
  count: 'Count',
  sum: 'Total',
  mean: 'Mean',
  min: 'Least',
  max: 'Most',
};

/**
 * A readable name for a statistic the interpreter collects, from the labels
 * in the model: `bug.count` is "Bugs", `bug.size.mean` "Mean Size",
 * `individual.status.dead` "Dead", `player.cooperate` "Cooperate".
 */
function seriesName(model: FormatModel, id: string): string | undefined {
  const path = id.split('.');
  const last = path.at(-1)!;
  const owner = (ids: readonly string[]) => {
    try {
      return agentAt(model, ids);
    } catch {
      return undefined;
    }
  };
  if (last === 'count') {
    const agent = owner(path.slice(0, -1));
    if (agent && agent !== model) return agent.pluralLabel ?? agent.label;
  }
  const statistic = STATISTICS[last];
  const attributeAt = (ids: readonly string[]) =>
    owner(ids.slice(0, -1))?.attributes?.[ids.at(-1)!];
  if (statistic) {
    const attribute = attributeAt(path.slice(0, -1));
    if (attribute) return `${statistic} ${attribute.label ?? path.at(-2)}`;
  }
  const state = attributeAt(path.slice(0, -1));
  if (state?.type === 'state') return state.options[last]?.label;
  return attributeAt(path)?.label;
}

/** Compiles a model in the model format (as data, checked here), with what the catalogue adds to it. */
export function compileCurated(source: unknown, curation: Curation = {}): Model {
  const model = parseModel(source);
  for (const ref of curation.gather ?? []) {
    const path = ref.split('.');
    const attribute = agentAt(model, path.slice(0, -1)).attributes?.[path.at(-1)!];
    if (!attribute) throw new Error(`${model.id} has no attribute ${ref}`);
    attribute.gatherData = true;
  }
  const compiled = compileModel(model);
  const charts = curation.charts ?? [];
  return {
    ...compiled,
    ...(curation.name !== undefined && { name: curation.name }),
    ...(curation.description !== undefined && { description: curation.description }),
    ...(curation.provenance !== undefined && { provenance: curation.provenance }),
    ...(charts.length > 0 && {
      views: () =>
        charts.map((chart) =>
          timeSeriesView({
            ...chart,
            labels: {
              ...Object.fromEntries(
                chart.series.flatMap((id) => {
                  const name = seriesName(model, id);
                  return name ? [[id, name]] : [];
                }),
              ),
              ...chart.labels,
            },
          }),
        ),
    }),
  };
}
