// @vitest-environment jsdom
// SPDX-License-Identifier: EPL-2.0
import { defineModel, ManualClock, ManualScheduler, Runner } from '@metascape/engine';
import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode, type ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useRunner, useRunnerState } from './hooks';

afterEach(cleanup);

const model = defineModel({ name: 'empty', parameters: {}, build() {} });
const otherModel = defineModel({ name: 'other', parameters: {}, build() {} });

function Probe({ runner }: { runner: Runner }): ReactElement {
  const { state, tick } = useRunnerState(runner);
  return (
    <p data-testid="probe">
      {state}:{tick}
    </p>
  );
}

function makeRunner(): { runner: Runner; scheduler: ManualScheduler } {
  const clock = new ManualClock();
  const scheduler = new ManualScheduler(clock);
  return {
    runner: new Runner(model, {
      seed: 1,
      clock,
      scheduler,
      ticksPerSecond: 10,
      frameIntervalMs: 100,
    }),
    scheduler,
  };
}

describe('useRunnerState', () => {
  it('re-renders on frames and state changes, including under StrictMode', () => {
    const { runner, scheduler } = makeRunner();
    render(
      <StrictMode>
        <Probe runner={runner} />
      </StrictMode>,
    );
    const text = () => screen.getByTestId('probe').textContent;
    expect(text()).toBe('ready:0');
    act(() => runner.start());
    expect(text()).toBe('running:0');
    act(() => {
      scheduler.runFrames(5);
    });
    expect(text()).toBe('running:5');
    act(() => runner.pause());
    expect(text()).toBe('paused:5');
    act(() => runner.restart());
    expect(text()).toBe('paused:0'.replace('paused', 'ready'));
  });

  it('returns the same object between changes and a new one after', () => {
    const { runner } = makeRunner();
    const seen: unknown[] = [];
    function Capture(): ReactElement {
      seen.push(useRunnerState(runner));
      return <p />;
    }
    const view = render(<Capture />);
    view.rerender(<Capture />);
    expect(seen[1]).toBe(seen[0]);
    act(() => {
      runner.step();
    });
    expect(seen[seen.length - 1]).not.toBe(seen[0]);
  });
});

describe('useRunner', () => {
  it('keeps one live runner under StrictMode and disposes it on unmount', async () => {
    const runners: Runner[] = [];
    function Host(): ReactElement {
      const runner = useRunner(model, { seed: 3 });
      runners.push(runner);
      const { tick } = useRunnerState(runner);
      return <p data-testid="tick">{tick}</p>;
    }
    const view = render(
      <StrictMode>
        <Host />
      </StrictMode>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    const live = runners[runners.length - 1]!;
    expect(live.step()).toBe(true);
    view.unmount();
    await Promise.resolve();
    expect(live.state).toBe('stopped');
    expect(live.step()).toBe(false);
  });

  it('makes a new runner when the model changes and disposes the old one', async () => {
    const seen: Runner[] = [];
    function Host({ which }: { which: typeof model }): ReactElement {
      seen.push(useRunner(which));
      return <p />;
    }
    const view = render(<Host which={model} />);
    view.rerender(<Host which={otherModel} />);
    await act(async () => {
      await Promise.resolve();
    });
    const first = seen[0]!;
    const last = seen[seen.length - 1]!;
    expect(last).not.toBe(first);
    expect(last.model).toBe(otherModel);
    expect(first.state).toBe('stopped');
    expect(last.state).toBe('ready');
  });
});
