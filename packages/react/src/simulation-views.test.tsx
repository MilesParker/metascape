// @vitest-environment jsdom
// SPDX-License-Identifier: EPL-2.0
import { Simulation } from '@metascape/engine';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentInspector } from './agent-inspector';
import { SimulationViews } from './simulation-views';
import { demoModel, Walker } from './testing/demo-model';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SimulationViews', () => {
  it('renders a titled panel for each spec of the demo model', () => {
    const sim = new Simulation(demoModel, { seed: 1 });
    sim.run(3);
    render(<SimulationViews sim={sim} frame={3} />);
    const specs = demoModel.views!(sim);
    expect(specs.map((s) => s.type).sort()).toEqual(
      ['bars', 'continuous', 'grid', 'histogram', 'network', 'timeSeries'].sort(),
    );
    for (const spec of specs) {
      expect(screen.getByRole('region', { name: spec.title })).toBeTruthy();
    }
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(6);
  });

  it('shows bar values and histogram counts as text', () => {
    const sim = new Simulation(demoModel, { seed: 1, parameters: { walkers: 5 } });
    sim.run(2);
    render(<SimulationViews sim={sim} frame={2} />);
    const bars = screen.getByRole('img', { name: /^Latest: Count walkers 5/ });
    expect(bars.textContent).toContain('5');
    const histogram = screen.getByRole('img', { name: /^Energy spread: 5 bins/ });
    const total = [...histogram.querySelectorAll('title')]
      .map((t) => Number(t.textContent?.split(': ')[1]))
      .reduce((a, b) => a + b, 0);
    expect(total).toBe(5);
  });

  it('does not throw when canvas contexts are null', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const sim = new Simulation(demoModel, { seed: 2 });
    const view = render(<SimulationViews sim={sim} frame={0} />);
    expect(() => {
      sim.step();
      view.rerender(<SimulationViews sim={sim} frame={1} />);
    }).not.toThrow();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('draws with a fake context and picks cells on click', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(240);
    const calls: string[] = [];
    const context = new Proxy(
      {},
      {
        get: (_t, name: string) =>
          name === 'createImageData' ? fakeImage : () => calls.push(name),
        set: () => true,
      },
    ) as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as RenderingContext,
    );
    const sim = new Simulation(demoModel, { seed: 3 });
    const picks: unknown[] = [];
    render(<SimulationViews sim={sim} frame={0} onPick={(agent) => picks.push(agent)} />);
    expect(calls).toContain('drawImage');
    expect(calls).toContain('arc');
    const grid = screen.getByRole('img', { name: 'Grid' });
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 240,
      height: 180,
      right: 240,
      bottom: 180,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.click(grid, { clientX: 1, clientY: 1 });
    expect(picks).toHaveLength(1);
  });

  it('reports a model without views', () => {
    const sim = new Simulation({ name: 'bare', parameters: {}, build() {} }, { seed: 1 });
    render(<SimulationViews sim={sim} frame={0} />);
    expect(screen.getByText(/no views/)).toBeTruthy();
  });
});

function fakeImage(width: number, height: number): ImageData {
  return { data: new Uint8ClampedArray(width * height * 4), width, height } as ImageData;
}

describe('AgentInspector', () => {
  it('lists id, alive and own primitive fields', () => {
    const sim = new Simulation(demoModel, { seed: 1 });
    const walker = sim.scape('walkers').members[0] as Walker;
    const view = render(<AgentInspector agent={walker} frame={0} />);
    const table = screen.getByRole('table');
    expect(table.textContent).toContain('energy');
    expect(table.textContent).toContain('walker');
    expect(table.textContent).toContain('alive');
    const energy = walker.energy;
    walker.energy = energy + 100;
    view.rerender(<AgentInspector agent={walker} frame={1} />);
    expect(screen.getByRole('table').textContent).toContain(String(energy + 100));
  });

  it('asks for a pick when there is no agent', () => {
    render(<AgentInspector agent={undefined} frame={0} />);
    expect(screen.getByText(/Click an agent/)).toBeTruthy();
  });
});
