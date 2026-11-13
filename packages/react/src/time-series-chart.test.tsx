// @vitest-environment jsdom
// SPDX-License-Identifier: EPL-2.0
import { Simulation, timeSeriesView, type TimeSeriesViewSpec } from '@metascape/engine';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ghostOf, seriesColors, TimeSeriesChart } from './time-series-chart';
import { demoModel } from './testing/demo-model';

const created: { options: unknown; data: unknown; setData: unknown[]; destroyed: boolean }[] = [];
let failing = false;

vi.mock('uplot', () => ({
  default: class FakePlot {
    readonly record: (typeof created)[number];
    readonly over = { addEventListener() {}, removeEventListener() {} };
    constructor(options: unknown, data: unknown) {
      if (failing) throw new Error('no canvas');
      this.record = { options, data, setData: [], destroyed: false };
      created.push(this.record);
    }
    setData(data: unknown): void {
      this.record.setData.push(data);
    }
    setSize(): void {}
    redraw(): void {}
    setCursor(): void {}
    valToPos(): number {
      return 0;
    }
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

type Options = {
  series: { label: string; stroke?: string }[];
  scales: { y: { range: (u: unknown, min: number, max: number) => [number, number] } };
  hooks: Record<string, unknown[]>;
  legend: { show: boolean };
  cursor: { sync?: { key: string } };
  axes: { label?: string; values: (u: unknown, ticks: number[]) => string[] }[];
};

describe('TimeSeriesChart', () => {
  it('creates the plot once, updates it on each frame and destroys it on unmount', async () => {
    const sim = new Simulation(demoModel, { seed: 1 });
    const chartSpec = spec();
    const view = render(<TimeSeriesChart spec={chartSpec} sim={sim} frame={0} syncKey="k" />);
    await flush();
    expect(created).toHaveLength(1);
    const options = created[0]!.options as Options;
    expect(options.series.map((x) => x.label)).toEqual(['Tick', 'Mean energy', 'Max energy']);
    expect(options.series[2]!.stroke).toBe('#ff0000');
    expect(options.legend.show).toBe(false);
    expect(options.cursor.sync?.key).toBe('k');
    expect(options.scales.y.range(null, 3, 9)[0]).toBe(0);
    expect(options.scales.y.range(null, 3, 9)[1]).toBeGreaterThanOrEqual(9);
    sim.run(4);
    view.rerender(<TimeSeriesChart spec={chartSpec} sim={sim} frame={1} syncKey="k" />);
    expect(created).toHaveLength(1);
    const latest = created[0]!.setData.at(-1) as Float64Array[];
    expect([...latest[0]!]).toEqual([0, 1, 2, 3, 4]);
    view.unmount();
    expect(created[0]!.destroyed).toBe(true);
  });

  it('shows the latest values in its own legend, and the time only under the cursor', async () => {
    const sim = new Simulation(demoModel, { seed: 1 });
    sim.run(2);
    render(<TimeSeriesChart spec={spec()} sim={sim} frame={0} />);
    await flush();
    const legend = screen.getByRole('list', { name: 'Energy values' });
    expect(legend.textContent).not.toContain('Tick');
    expect(legend.textContent).toContain('Mean energy');
    expect(legend.textContent).toContain(
      String(Number(sim.data.latest('energy.max').toPrecision(4))),
    );
  });

  it('labels the time axis with the model time and allows for a ghost run in the range', async () => {
    const sim = new Simulation(demoModel, { seed: 1 });
    sim.run(3);
    const ghost = ghostOf(sim);
    ghost.values['energy.max']![1] = 1e6;
    const fresh = new Simulation(demoModel, { seed: 2 });
    render(
      <TimeSeriesChart
        spec={spec()}
        sim={fresh}
        frame={0}
        ghost={ghost}
        marks={[{ tick: 1, label: 'x' }]}
      />,
    );
    await flush();
    const options = created[0]!.options as Options;
    expect(options.scales.y.range(null, 0, 10)[1]).toBeGreaterThanOrEqual(1e6);
    expect(options.hooks['draw']).toHaveLength(1);
    expect(options.axes[0]!.values(null, [0, 5])).toEqual(['0', '5']);
    expect(screen.getByText('Previous run')).toBeTruthy();
  });

  it('decimates long runs but keeps the data fresh when buffers grow', async () => {
    const sim = new Simulation(demoModel, { seed: 1 });
    const chartSpec = spec();
    const view = render(<TimeSeriesChart spec={chartSpec} sim={sim} frame={0} />);
    await flush();
    sim.run(6000);
    view.rerender(<TimeSeriesChart spec={chartSpec} sim={sim} frame={1} />);
    const data = created[0]!.setData.at(-1) as Float64Array[];
    expect(data[0]!.length).toBeLessThanOrEqual(2002);
    expect(data[0]!.at(-1)).toBe(6000);
  });

  it('leaves an empty plot area when the plot cannot be created', async () => {
    failing = true;
    const sim = new Simulation(demoModel, { seed: 1 });
    render(<TimeSeriesChart spec={spec()} sim={sim} frame={0} />);
    await flush();
    const box = screen.getByRole('img');
    expect(box.getAttribute('data-unavailable')).toBe('true');
    expect(box.childElementCount).toBe(0);
  });

  it('swaps colours that would vanish on the background for the text colour', () => {
    const colors = seriesColors(
      { series: ['a', 'b'], colors: { a: 0x000000, b: 0xff0000 } },
      '#1f2228',
      '#eee',
    );
    expect(colors).toEqual(['#eee', '#ff0000']);
  });
});
