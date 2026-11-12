// SPDX-License-Identifier: EPL-2.0
import type { Series } from '@metascape/engine';
import { useId, useState, type ReactElement } from 'react';
import { seriesGrid, toggled, type ChartChoice } from './chart-customization';

/** Props of {@link ChartCustomizer}. */
export interface ChartCustomizerProps {
  /** The chart's title, for labelling. */
  readonly title: string;
  /** Every series the simulation records, whether or not any chart shows it. */
  readonly recorded: readonly Series[];
  /** What the chart shows now. */
  readonly choice: ChartChoice;
  readonly onChange: (choice: ChartChoice) => void;
  /** Present when the chart differs from the model's own: puts it back. */
  readonly onReset?: (() => void) | undefined;
  /** Present for a chart the user added: removes it. */
  readonly onRemove?: (() => void) | undefined;
}

const STATISTIC_LABELS: Readonly<Record<string, string>> = {
  count: 'Count',
  sum: 'Sum',
  mean: 'Avg',
  min: 'Min',
  max: 'Max',
  variance: 'Variance',
  stdDev: 'Std dev',
  value: 'Value',
};

/**
 * A "Customize" button that opens a picker for one chart: which of the
 * recorded series it shows (measures down, statistics across), and whether it
 * is a time series or bars. Changes apply at once.
 */
export function ChartCustomizer({
  title,
  recorded,
  choice,
  onChange,
  onReset,
  onRemove,
}: ChartCustomizerProps): ReactElement {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const grid = seriesGrid(recorded);
  const shown = new Set(choice.series);

  return (
    <div className="ms-customizer">
      <button
        type="button"
        className="ms-button ms-button-small"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Customize ${title}`}
        onClick={() => setOpen(!open)}
      >
        Customize
      </button>
      <div
        id={panelId}
        className="ms-customizer-panel"
        role="group"
        aria-label={`Customize ${title}`}
        hidden={!open}
      >
        {open && (
          <>
            <fieldset className="ms-fieldset">
              <legend>Chart type</legend>
              {(
                [
                  ['timeSeries', 'Time series'],
                  ['bars', 'Bars'],
                ] as const
              ).map(([type, label]) => (
                <label key={type} className="ms-inline-label">
                  <input
                    type="radio"
                    name={`${panelId}-type`}
                    checked={choice.type === type}
                    onChange={() => onChange({ ...choice, type })}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <div className="ms-grid-scroll">
              <table className="ms-series-grid">
                <caption className="ms-visually-hidden">Series shown in {title}</caption>
                <thead>
                  <tr>
                    <th scope="col">Measure</th>
                    {grid.statistics.map((statistic) => (
                      <th key={statistic} scope="col">
                        {STATISTIC_LABELS[statistic] ?? statistic}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.rows.map((row) => (
                    <tr key={row.measure}>
                      <th scope="row">{row.measure}</th>
                      {grid.statistics.map((statistic) => {
                        const series = row.byStatistic.get(statistic);
                        return (
                          <td key={statistic}>
                            {series && (
                              <input
                                type="checkbox"
                                aria-label={series.label}
                                checked={shown.has(series.id)}
                                // A chart always keeps at least one series.
                                disabled={shown.has(series.id) && shown.size === 1}
                                onChange={(event) =>
                                  onChange(toggled(choice, series.id, event.target.checked))
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
            <div className="ms-customizer-actions">
              {onReset && (
                <button type="button" className="ms-button ms-button-small" onClick={onReset}>
                  Reset chart
                </button>
              )}
              {onRemove && (
                <button type="button" className="ms-button ms-button-small" onClick={onRemove}>
                  Remove chart
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
