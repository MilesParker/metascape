// SPDX-License-Identifier: EPL-2.0
import { Simulation, timeSeriesView } from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import {
  NO_CUSTOMIZATIONS,
  seriesGrid,
  shownViews,
  toggled,
  withAddedChoice,
  withChange,
  withNewChart,
  withoutAdded,
} from './chart-customization';
import { demoModel } from './testing/demo-model';

const sim = new Simulation(demoModel, { seed: 1 });
const specs = sim.views;
const position = specs.findIndex((s) => s.type === 'timeSeries');

describe('seriesGrid', () => {
  it('puts measures in rows and statistics in columns, including counts', () => {
    const grid = seriesGrid(sim.data.series);
    expect(grid.statistics).toEqual(['mean', 'max', 'count']);
    expect(grid.rows.map((r) => r.measure)).toEqual(['energy', 'walkers']);
    expect(grid.rows[0]!.byStatistic.get('max')!.id).toBe('energy.max');
    expect(grid.rows[1]!.byStatistic.get('count')!.id).toBe('walkers');
    expect(grid.rows[1]!.byStatistic.has('mean')).toBe(false);
  });
});

describe('shownViews', () => {
  it('leaves the model alone without customizations', () => {
    const shown = shownViews(specs, NO_CUSTOMIZATIONS, sim);
    expect(shown.map((v) => v.spec)).toEqual(specs);
    expect(shown.filter((v) => v.customizable)).toHaveLength(2);
    expect(shown.some((v) => v.customized)).toBe(false);
  });

  it('applies a choice at a position, switching type and keeping model colours', () => {
    const colored = [
      timeSeriesView({
        title: 'T',
        series: ['energy.mean'],
        colors: { 'energy.mean': { r: 1, g: 0, b: 0 } as never },
        yMin: 0,
      }),
    ];
    const next = withChange(NO_CUSTOMIZATIONS, 0, { type: 'bars', series: ['walkers'] });
    const [view] = shownViews(colored, next, sim);
    expect(view!.customized).toBe(true);
    expect(view!.spec).toMatchObject({ type: 'bars', title: 'T', series: ['walkers'] });
    expect(view!.spec).toHaveProperty('colors');
    const back = shownViews(
      colored,
      withChange(next, 0, { type: 'timeSeries', series: ['walkers'] }),
      sim,
    );
    expect(back[0]!.spec).toMatchObject({ type: 'timeSeries', yMin: 0 });
  });

  it('forgets a change, and drops series that are not recorded', () => {
    const next = withChange(NO_CUSTOMIZATIONS, position, {
      type: 'timeSeries',
      series: ['gone', 'walkers'],
    });
    const view = shownViews(specs, next, sim)[position]!;
    expect(view.spec).toMatchObject({ series: ['walkers'] });
    const none = shownViews(specs, withChange(next, position, undefined), sim);
    expect(none[position]!.customized).toBe(false);
    const allGone = shownViews(
      specs,
      withChange(NO_CUSTOMIZATIONS, position, { type: 'timeSeries', series: ['gone'] }),
      sim,
    );
    expect(allGone[position]!.spec).toEqual(specs[position]);
  });

  it('ignores a change at a position that is not a chart', () => {
    const grid = specs.findIndex((s) => s.type === 'grid');
    const shown = shownViews(
      specs,
      withChange(NO_CUSTOMIZATIONS, grid, { type: 'bars', series: ['walkers'] }),
      sim,
    );
    expect(shown[grid]!.spec).toBe(specs[grid]);
  });

  it('adds, edits and removes charts after the model views', () => {
    let c = withNewChart(NO_CUSTOMIZATIONS, 'walkers');
    c = withNewChart(c, 'energy.max');
    expect(c.added.map((a) => a.title)).toEqual(['Custom chart 1', 'Custom chart 2']);
    c = withAddedChoice(c, 1, { type: 'bars', series: ['energy.max', 'energy.mean'] });
    const shown = shownViews(specs, c, sim);
    expect(shown).toHaveLength(specs.length + 2);
    const last = shown[shown.length - 1]!;
    expect(last).toMatchObject({ position: undefined, addedIndex: 1 });
    expect(last.spec).toMatchObject({ type: 'bars', series: ['energy.max', 'energy.mean'] });
    c = withoutAdded(c, 0);
    expect(c.added.map((a) => a.title)).toEqual(['Custom chart 2']);
    expect(withNewChart(c, 'walkers').added[1]!.title).toBe('Custom chart 3');
  });

  it('survives a JSON round trip', () => {
    const c = withChange(withNewChart(NO_CUSTOMIZATIONS, 'walkers'), position, {
      type: 'bars',
      series: ['walkers'],
    });
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });
});

describe('toggled', () => {
  it('adds at the end and removes in place', () => {
    const base = { type: 'timeSeries', series: ['a', 'b'] } as const;
    expect(toggled(base, 'c', true).series).toEqual(['a', 'b', 'c']);
    expect(toggled(base, 'a', true)).toBe(base);
    expect(toggled(base, 'a', false).series).toEqual(['b']);
  });
});
