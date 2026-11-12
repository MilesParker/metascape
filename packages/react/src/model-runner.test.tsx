// @vitest-environment jsdom
// SPDX-License-Identifier: EPL-2.0
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ModelRunner } from './model-runner';
import { demoModel } from './testing/demo-model';

afterEach(cleanup);

describe('ModelRunner', () => {
  it('shows controls, views and parameters, and applies changed parameters on restart', () => {
    render(
      <StrictMode>
        <ModelRunner model={demoModel} options={{ seed: 5 }} />
      </StrictMode>,
    );
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Grid' })).toBeTruthy();
    expect(screen.getByText(/Click an agent/)).toBeTruthy();

    const apply = screen.getByRole('button', { name: 'Apply and restart' });
    expect(apply).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Walkers'), { target: { value: '9' } });
    expect(apply).toHaveProperty('disabled', false);

    fireEvent.click(screen.getByRole('button', { name: 'Step' }));
    expect(screen.getByTestId('ms-tick').textContent).toBe('1');
    fireEvent.click(apply);
    expect(screen.getByTestId('ms-tick').textContent).toBe('0');
    expect(screen.getByRole('button', { name: 'Apply and restart' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('img', { name: /^Latest: Count walkers 9/ })).toBeTruthy();
  });

  it('shows where a model comes from', () => {
    const credited = {
      ...demoModel,
      provenance: {
        authors: 'A. Modeler',
        citation: 'Modeler, A. (1999). A model.',
        portedFrom: 'Ascape 5.6.1, edu.brook.demo.Demo',
        copyright: 'Copyright 1998-2007 The Brookings Institution.',
      },
    };
    render(<ModelRunner model={credited} options={{ seed: 5 }} />);
    expect(screen.getByText(/Model by A\. Modeler\./)).toBeTruthy();
    expect(screen.getByText(/Ported from Ascape 5\.6\.1, edu\.brook\.demo\.Demo\./)).toBeTruthy();
    expect(screen.getByText(/The Brookings Institution/)).toBeTruthy();
  });
});

describe('ModelRunner run-time editing', () => {
  const chart = (name: RegExp | string) => screen.getByRole('region', { name });

  it('switches between Parameters and Rules tabs, with arrow keys', () => {
    render(<ModelRunner model={demoModel} options={{ seed: 5 }} />);
    const parameters = screen.getByRole('tab', { name: 'Parameters' });
    const rules = screen.getByRole('tab', { name: 'Rules' });
    expect(parameters.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByLabelText('Walkers')).toBeTruthy();
    fireEvent.keyDown(parameters, { key: 'ArrowRight' });
    expect(rules.getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByLabelText('Walkers')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reset to model defaults' })).toBeTruthy();
    fireEvent.click(parameters);
    expect(screen.getByLabelText('Walkers')).toBeTruthy();
  });

  it('keeps rule settings across Restart and Apply and restart until reset', () => {
    render(<ModelRunner model={demoModel} options={{ seed: 5 }} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Rules' }));
    fireEvent.click(screen.getByLabelText('By rule'));
    fireEvent.click(screen.getByLabelText('wander'));
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
    expect((screen.getByLabelText('By rule') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('wander') as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByRole('tab', { name: 'Parameters' }));
    fireEvent.change(screen.getByLabelText('Walkers'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply and restart' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Rules' }));
    expect((screen.getByLabelText('wander') as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Reset to model defaults' }));
    expect((screen.getByLabelText('By agent') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('wander') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
    expect((screen.getByLabelText('wander') as HTMLInputElement).checked).toBe(true);
  });

  it('customizes a chart from any recorded series and keeps the choice on restart', () => {
    render(<ModelRunner model={demoModel} options={{ seed: 5 }} />);
    const energy = chart('Energy over time');
    expect(within(energy).getByRole('img').getAttribute('aria-label')).toContain(
      'energy.mean, energy.max',
    );
    // The chart does not show the walker count, but it is recorded and can be picked.
    fireEvent.click(within(energy).getByRole('button', { name: 'Customize Energy over time' }));
    fireEvent.click(within(energy).getByLabelText('Count walkers'));
    fireEvent.click(within(energy).getByLabelText('Max energy'));
    expect(within(chart('Energy over time')).getByRole('img').getAttribute('aria-label')).toContain(
      'energy.mean, walkers',
    );
    fireEvent.click(within(energy).getByLabelText('Bars'));
    expect(within(chart('Energy over time')).getByRole('img').getAttribute('aria-label')).toMatch(
      /^Energy over time: Mean energy/,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
    const after = chart('Energy over time');
    expect(within(after).getByRole('img').getAttribute('aria-label')).toMatch(/Count walkers/);
    expect(within(after).queryByLabelText('Max energy')).not.toBeNull();

    fireEvent.click(within(after).getByRole('button', { name: 'Reset chart' }));
    expect(within(chart('Energy over time')).getByRole('img').getAttribute('aria-label')).toContain(
      'energy.mean, energy.max',
    );
  });

  it('never lets a chart lose its last series', () => {
    render(<ModelRunner model={demoModel} options={{ seed: 5 }} />);
    const energy = chart('Energy over time');
    fireEvent.click(within(energy).getByRole('button', { name: 'Customize Energy over time' }));
    fireEvent.click(within(energy).getByLabelText('Max energy'));
    expect(within(energy).getByLabelText('Mean energy')).toHaveProperty('disabled', true);
  });

  it('adds a chart from a series nothing shows, and removes it', () => {
    render(<ModelRunner model={demoModel} options={{ seed: 5 }} />);
    fireEvent.change(screen.getByLabelText('Add chart from series'), {
      target: { value: 'walkers' },
    });
    const added = chart('Custom chart 1');
    expect(within(added).getByRole('img').getAttribute('aria-label')).toContain('walkers');
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
    expect(chart('Custom chart 1')).toBeTruthy();
    fireEvent.click(
      within(chart('Custom chart 1')).getByRole('button', { name: 'Customize Custom chart 1' }),
    );
    fireEvent.click(within(chart('Custom chart 1')).getByRole('button', { name: 'Remove chart' }));
    expect(screen.queryByRole('region', { name: 'Custom chart 1' })).toBeNull();
  });
});
