// @vitest-environment jsdom
// SPDX-License-Identifier: EPL-2.0
import { Simulation, timeSeriesView, type TimeSeriesViewSpec } from '@metascape/engine';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimeSeriesChart } from './time-series-chart';
import { demoModel } from './testing/demo-model';

const created: { options: unknown; data: unknown; setData: unknown[]; destroyed: boolean }[] = [];
let failing = false;

vi.mock('uplot', () => ({
  default: class FakePlot {
    readonly record: (typeof created)[number];
    constructor(options: unknown, data: unknown) {
      if (failing) throw new Error('no canvas');
      this.record = { options, data, setData: [], destroyed: false };
      created.push(this.record);
    }
    setData(data: unknown): void {
      this.record.setData.push(data);
    }
    setSize(): void {}
    destroy(): void {
      this.record.destroyed = true;
    }
  },
}));

afterEach(() => {
  cleanup();
  created.length = 0;
  failing = false;
});

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

function spec(): TimeSeriesViewSpec {
  return timeSeriesView({
    title: 'Energy',
    series: ['energy.mean', 'energy.max'],
    yMin: 0,
    colors: { 'energy.max': 0xff0000 },
  }) as TimeSeriesViewSpec;
}

describe('TimeSeriesChart', () => {
  it('creates the plot once, updates it on each frame and destroys it on unmount', async () => {
    const sim = new Simulation(demoModel, { seed: 1 });
    const s = spec();
    const view = render(<TimeSeriesChart spec={s} sim={sim} frame={0} />);
    await flush();
    expect(created).toHaveLength(1);
    const options = created[0]!.options as {
      series: { label?: string; stroke?: string }[];
      scales: { y: { range: (u: unknown, min: number, max: number) => [number, number] } };
    };
    expect(options.series.map((x) => x.label)).toEqual(['Tick', 'Mean energy', 'Max energy']);
    expect(options.series[2]!.stroke).toBe('#ff0000');
    expect(options.scales.y.range(null, 3, 9)).toEqual([0, 9]);
    expect(options.scales.y.range(null, 5, 5)).toEqual([0, 5]);

    sim.run(4);
    view.rerender(<TimeSeriesChart spec={s} sim={sim} frame={4} />);
    expect(created).toHaveLength(1);
    const latest = created[0]!.setData.at(-1) as Float64Array[];
    expect(latest).toHaveLength(3);
    expect([...latest[0]!]).toEqual([0, 1, 2, 3, 4]);

    view.unmount();
    expect(created[0]!.destroyed).toBe(true);
  });

  it('decimates long runs but keeps the data fresh when buffers grow', async () => {
    const sim = new Simulation(demoModel, { seed: 1 });
    const s = spec();
    const view = render(<TimeSeriesChart spec={s} sim={sim} frame={0} />);
    await flush();
    sim.run(6000);
    view.rerender(<TimeSeriesChart spec={s} sim={sim} frame={1} />);
    const data = created[0]!.setData.at(-1) as Float64Array[];
    expect(data[0]!.length).toBeLessThanOrEqual(2002);
    expect(data[0]!.at(-1)).toBe(6000);
  });

  it('leaves an empty container when the plot cannot be created', async () => {
    failing = true;
    const sim = new Simulation(demoModel, { seed: 1 });
    const view = render(<TimeSeriesChart spec={spec()} sim={sim} frame={0} />);
    await flush();
    const box = view.container.querySelector('.ms-timeseries')!;
    expect(box.getAttribute('data-unavailable')).toBe('true');
    expect(box.childElementCount).toBe(0);
    expect(() =>
      view.rerender(<TimeSeriesChart spec={spec()} sim={sim} frame={1} />),
    ).not.toThrow();
  });
});
