// @vitest-environment jsdom
// SPDX-License-Identifier: EPL-2.0
import { defineModel, int, ManualClock, ManualScheduler, Runner } from '@metascape/engine';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { positionToSpeed, RunControls, speedToPosition } from './run-controls';

afterEach(cleanup);

const model = defineModel({ name: 'empty', parameters: { size: int(1) }, build() {} });

function rig(throwAt?: number) {
  const clock = new ManualClock();
  const scheduler = new ManualScheduler(clock);
  const failing = defineModel({
    name: 'failing',
    parameters: {},
    build(sim) {
      sim.observe({
        stepped(s) {
          if (s.tick === throwAt) throw new Error('boom at 2');
        },
      });
    },
  });
  const runner = new Runner(throwAt === undefined ? model : failing, {
    seed: 7,
    clock,
    scheduler,
    frameIntervalMs: 100,
    ticksPerSecond: 10,
  });
  return { runner, scheduler };
}

const tick = () => screen.getByTestId('ms-tick').textContent;
const state = () => screen.getByTestId('ms-state').textContent;

describe('RunControls', () => {
  it('starts, pauses, steps and restarts a runner and shows tick, state and seed', () => {
    const { runner, scheduler } = rig();
    render(<RunControls runner={runner} />);
    expect(tick()).toBe('0');
    expect(state()).toBe('ready');
    expect(screen.getByTestId('ms-seed').textContent).toBe('7');

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(state()).toBe('running');
    expect(screen.getByRole('button', { name: 'Step' })).toHaveProperty('disabled', true);
    act(() => {
      scheduler.runFrames(3);
    });
    expect(Number(tick())).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(state()).toBe('paused');
    const paused = Number(tick());
    fireEvent.click(screen.getByRole('button', { name: 'Step' }));
    expect(Number(tick())).toBe(paused + 1);

    fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
    expect(tick()).toBe('0');
    expect(state()).toBe('ready');
  });

  it('applies an edited seed on restart', () => {
    const { runner } = rig();
    render(<RunControls runner={runner} />);
    fireEvent.change(screen.getByLabelText(/Seed/), { target: { value: '42' } });
    expect(screen.getByTestId('ms-seed').textContent).toBe('7');
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
    expect(screen.getByTestId('ms-seed').textContent).toBe('42');
    expect(runner.sim.seed).toBe(42);
  });

  it('changes the runner speed from the slider, with a Max position', () => {
    const { runner } = rig();
    render(<RunControls runner={runner} />);
    const slider = screen.getByLabelText('Speed');
    fireEvent.change(slider, { target: { value: '0' } });
    expect(runner.ticksPerSecond).toBe(1);
    fireEvent.change(slider, { target: { value: '99' } });
    expect(runner.ticksPerSecond).toBe(1000);
    fireEvent.change(slider, { target: { value: '100' } });
    expect(runner.ticksPerSecond).toBe(Infinity);
    expect(screen.getByText('Max')).toBeTruthy();
  });

  it('shows the error of a failed runner and disables start and step', () => {
    const { runner } = rig(2);
    render(<RunControls runner={runner} />);
    fireEvent.click(screen.getByRole('button', { name: 'Step' }));
    fireEvent.click(screen.getByRole('button', { name: 'Step' }));
    expect(state()).toBe('stopped');
    expect(screen.getByRole('alert').textContent).toContain('boom at 2');
    expect(screen.getByRole('button', { name: 'Start' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Step' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('speed scale', () => {
  it('is logarithmic from 1 to 1000 and round-trips', () => {
    expect(positionToSpeed(0)).toBe(1);
    expect(positionToSpeed(99)).toBe(1000);
    expect(positionToSpeed(100)).toBe(Infinity);
    expect(positionToSpeed(33)).toBe(10);
    for (const p of [0, 10, 33, 50, 99, 100]) expect(speedToPosition(positionToSpeed(p))).toBe(p);
  });
});
