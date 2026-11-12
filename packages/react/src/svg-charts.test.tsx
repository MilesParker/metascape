// @vitest-environment jsdom
// SPDX-License-Identifier: EPL-2.0
import { Simulation, histogramView, type HistogramViewSpec } from '@metascape/engine';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { edgeTickIndexes, HistogramChart } from './svg-charts';
import { demoModel } from './testing/demo-model';

afterEach(cleanup);

describe('HistogramChart', () => {
  it('labels the x axis with real values and titles bars with their range and count', () => {
    const sim = new Simulation(demoModel, { seed: 1 });
    sim.run(2);
    const spec = histogramView({
      title: 'Energy spread',
      distribution: 'energyDistribution',
    }) as HistogramViewSpec;
    const { container } = render(<HistogramChart spec={spec} sim={sim} frame={2} />);
    const ticks = [...container.querySelectorAll('text.ms-svg-tick')].map((t) => t.textContent);
    // 0 and the peak belong to the y axis; the x axis runs 0..25 in steps of 5.
    for (const edge of ['0', '5', '10', '15', '20', '25']) expect(ticks).toContain(edge);
    const titles = [...container.querySelectorAll('rect > title')].map((t) => t.textContent);
    expect(titles).toHaveLength(5);
    const counts = sim.data.distributionCounts('energyDistribution');
    expect(titles[0]).toBe(`0 to 5: ${counts[0]}`);
    expect(titles[4]).toBe(`20 to 25: ${counts[4]}`);
    expect(container.querySelector('svg')!.getAttribute('aria-label')).toContain('from 0 to 25');
  });

  it('picks evenly spaced edges including both ends', () => {
    expect(edgeTickIndexes(5)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(edgeTickIndexes(20)).toEqual([0, 5, 10, 15, 20]);
    expect(edgeTickIndexes(2)).toEqual([0, 1, 2]);
    expect(edgeTickIndexes(1)).toEqual([0, 1]);
  });
});
