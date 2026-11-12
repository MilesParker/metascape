// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import { defineModel, int, ParameterError, type Simulation } from '..';
import { ManualClock, ManualScheduler, Runner, type RunnerOptions } from './index';

/** A model with no agents; `onStep` runs each tick. */
const model = (onStep?: (sim: Simulation) => void) =>
  defineModel({
    name: 'counter',
    parameters: { size: int(1) },
    build(sim) {
      sim.observe({ stepped: (s) => onStep?.(s) });
    },
  });

function rig(
  options: Partial<RunnerOptions<{ size: ReturnType<typeof int> }>> = {},
  onStep?: (sim: Simulation, clock: ManualClock) => void,
) {
  const clock = new ManualClock();
  const scheduler = new ManualScheduler(clock);
  const runner = new Runner(
    model((sim) => onStep?.(sim, clock)),
    { seed: 1, scheduler, clock, frameIntervalMs: 20, ...options },
  );
  return { clock, scheduler, runner };
}

describe('Runner states', () => {
  it('starts ready at tick 0 with a simulation', () => {
    const { runner, scheduler } = rig();
    expect(runner.state).toBe('ready');
    expect(runner.sim.tick).toBe(0);
    expect(scheduler.pending).toBe(0);
  });

  it('ready -> running -> paused -> running', () => {
    const { runner, scheduler } = rig();
    const states: string[] = [];
    runner.onStateChange((s) => states.push(s));
    runner.start();
    expect(runner.state).toBe('running');
    expect(scheduler.pending).toBe(1);
    runner.pause();
    expect(runner.state).toBe('paused');
    expect(scheduler.pending).toBe(0);
    runner.start();
    expect(scheduler.pending).toBe(1);
    expect(states).toEqual(['running', 'paused', 'running']);
  });

  it('ignores harmless invalid transitions', () => {
    const { runner, scheduler } = rig();
    runner.pause();
    expect(runner.state).toBe('ready');
    runner.start();
    runner.start();
    expect(scheduler.pending).toBe(1);
    expect(runner.step()).toBe(false);
    expect(runner.sim.tick).toBe(0);
    runner.pause();
    runner.pause();
    expect(runner.state).toBe('paused');
  });

  it('step runs one tick from ready (becoming paused) and from paused', () => {
    const { runner } = rig();
    const states: string[] = [];
    runner.onStateChange((s) => states.push(s));
    expect(runner.step()).toBe(true);
    expect(runner.state).toBe('paused');
    expect(runner.sim.tick).toBe(1);
    expect(runner.step()).toBe(true);
    expect(runner.sim.tick).toBe(2);
    expect(states).toEqual(['paused']);
  });

  it('a stopped runner ignores start, pause and step, but restarts', () => {
    const { runner, scheduler } = rig({ stopAt: 1 });
    runner.step();
    expect(runner.state).toBe('stopped');
    runner.start();
    runner.pause();
    expect(runner.step()).toBe(false);
    expect(runner.state).toBe('stopped');
    expect(scheduler.pending).toBe(0);
    runner.restart();
    expect(runner.state).toBe('ready');
    expect(runner.sim.tick).toBe(0);
  });

  it('restart ends ready from paused and running stays running', () => {
    const { runner, scheduler } = rig();
    runner.step();
    runner.restart();
    expect(runner.state).toBe('ready');
    runner.start();
    scheduler.runNext();
    runner.restart();
    expect(runner.state).toBe('running');
    expect(runner.sim.tick).toBe(0);
    expect(scheduler.pending).toBe(1);
  });

  it('stops when the model stops itself', () => {
    const { runner, scheduler } = rig({ ticksPerSecond: 60 }, (sim) => {
      if (sim.tick === 3) sim.stop('done');
    });
    runner.start();
    scheduler.runFrames(10);
    expect(runner.state).toBe('stopped');
    expect(runner.sim.tick).toBe(3);
    expect(runner.sim.stopReason).toBe('done');
    expect(scheduler.pending).toBe(0);
  });

  it('stops at stopAt', () => {
    const { runner, scheduler } = rig({ stopAt: 5, ticksPerSecond: 600 });
    runner.start();
    scheduler.runNext();
    expect(runner.sim.tick).toBe(5);
    expect(runner.state).toBe('stopped');
  });

  it('a model that stops while building stops on the first frame', () => {
    const clock = new ManualClock();
    const scheduler = new ManualScheduler(clock);
    const runner = new Runner(
      defineModel({
        name: 'early',
        parameters: {},
        build(sim) {
          sim.stop();
        },
      }),
      { scheduler, clock, ticksPerSecond: 600 },
    );
    runner.start();
    scheduler.runNext();
    expect(runner.state).toBe('stopped');
  });

  it('pauseAt pauses exactly at that tick and resumes past it', () => {
    const { runner, scheduler } = rig({ ticksPerSecond: 300, pauseAt: 4 });
    runner.start();
    scheduler.runNext();
    expect(runner.sim.tick).toBe(4);
    expect(runner.state).toBe('paused');
    expect(scheduler.pending).toBe(0);
    runner.start();
    scheduler.runNext();
    expect(runner.sim.tick).toBe(4 + 6);
    expect(runner.state).toBe('running');
  });

  it('dispose stops, cancels, drops listeners and ignores later calls', () => {
    const { runner, scheduler } = rig();
    let frames = 0;
    runner.onFrame(() => frames++);
    runner.start();
    runner.dispose();
    expect(runner.state).toBe('stopped');
    expect(scheduler.pending).toBe(0);
    runner.start();
    runner.restart();
    expect(runner.step()).toBe(false);
    expect(runner.state).toBe('stopped');
    expect(frames).toBe(0);
    runner.dispose();
  });
});

describe('Runner pacing', () => {
  it('runs 30 ticks/s at 50 frames/s with fractional carry', () => {
    const { runner, scheduler } = rig({ ticksPerSecond: 30 });
    const frames: number[] = [];
    runner.onFrame((sim) => frames.push(sim.tick));
    runner.start();
    scheduler.runFrames(10);
    // 0.6 ticks per frame: 0, 1, 1, 2, 3, 3, 4, 4, 5, 6 cumulative.
    expect(frames).toEqual([0, 1, 1, 2, 3, 3, 4, 4, 5, 6]);
    scheduler.runFrames(40);
    expect(runner.sim.tick).toBe(30);
  });

  it('runs 30 ticks/s at 60 frames/s', () => {
    const { runner, scheduler } = rig({ ticksPerSecond: 30, frameIntervalMs: 1000 / 60 });
    runner.start();
    scheduler.runFrames(60);
    expect(runner.sim.tick).toBe(30);
    scheduler.runFrames(2);
    expect(runner.sim.tick).toBe(31);
  });

  it('runs several ticks per frame at high speed', () => {
    const { runner, scheduler } = rig({ ticksPerSecond: 500 });
    runner.start();
    scheduler.runFrames(3);
    expect(runner.sim.tick).toBe(30);
  });

  it('runs slow speeds one tick every few frames', () => {
    const { runner, scheduler } = rig({ ticksPerSecond: 5 });
    runner.start();
    scheduler.runFrames(9);
    expect(runner.sim.tick).toBe(0);
    scheduler.runFrames(1);
    expect(runner.sim.tick).toBe(1);
    scheduler.runFrames(10);
    expect(runner.sim.tick).toBe(2);
  });

  it('setSpeed changes the pace', () => {
    const { runner, scheduler } = rig({ ticksPerSecond: 50 });
    runner.start();
    scheduler.runFrames(2);
    expect(runner.sim.tick).toBe(2);
    runner.setSpeed(100);
    expect(runner.ticksPerSecond).toBe(100);
    scheduler.runFrames(2);
    expect(runner.sim.tick).toBe(6);
  });

  it('rejects invalid speeds', () => {
    const { runner } = rig();
    expect(() => runner.setSpeed(0)).toThrow(RangeError);
    expect(() => runner.setSpeed(-1)).toThrow(RangeError);
    expect(() => runner.setSpeed(NaN)).toThrow(RangeError);
    expect(() => rig({ ticksPerSecond: 0 })).toThrow(RangeError);
  });

  it('cuts a frame short at the budget and drops the backlog', () => {
    // 1000 ticks/s with 20 ms frames is 20 ticks due; each tick costs 1 ms; budget 5 ms.
    const { runner, scheduler } = rig({ ticksPerSecond: 1000, frameBudgetMs: 5 }, (_, clock) =>
      clock.advance(1),
    );
    runner.start();
    scheduler.runNext();
    expect(runner.sim.tick).toBe(5);
    // The backlog is not carried over: the next frame is again limited to 5 ticks.
    scheduler.runNext();
    expect(runner.sim.tick).toBe(10);
  });

  it('always runs at least one tick per frame, even with a tiny budget', () => {
    const { runner, scheduler } = rig({ ticksPerSecond: 1000, frameBudgetMs: 0 });
    runner.start();
    scheduler.runNext();
    expect(runner.sim.tick).toBe(1);
  });

  it('steps until the budget is used at Infinity speed', () => {
    const { runner, scheduler } = rig({ ticksPerSecond: Infinity, frameBudgetMs: 12 }, (_, clock) =>
      clock.advance(2),
    );
    let frames = 0;
    runner.onFrame(() => frames++);
    runner.start();
    scheduler.runNext();
    expect(runner.sim.tick).toBe(6);
    expect(frames).toBe(1);
    expect(scheduler.lastDelayMs).toBe(0);
    scheduler.runNext();
    expect(runner.sim.tick).toBe(12);
  });

  it('Infinity speed still honors pauseAt and stopAt', () => {
    const a = rig({ ticksPerSecond: Infinity, pauseAt: 7 }, (_, c) => c.advance(1));
    a.runner.start();
    a.scheduler.runNext();
    expect(a.runner.sim.tick).toBe(7);
    expect(a.runner.state).toBe('paused');
    const b = rig({ ticksPerSecond: Infinity, stopAt: 4 }, (_, c) => c.advance(1));
    b.runner.start();
    b.scheduler.runNext();
    expect(b.runner.state).toBe('stopped');
    expect(b.runner.sim.tick).toBe(4);
  });

  it('does not count time spent paused', () => {
    const { runner, scheduler, clock } = rig({ ticksPerSecond: 50 });
    runner.start();
    scheduler.runFrames(1);
    runner.pause();
    clock.advance(10_000);
    runner.start();
    scheduler.runFrames(1);
    expect(runner.sim.tick).toBe(2);
  });
});

describe('Runner restart', () => {
  it('keeps an explicit seed and regenerates an unspecified one', () => {
    const fixed = rig({ seed: 42 });
    fixed.runner.restart();
    expect(fixed.runner.sim.seed).toBe(42);

    const clock = new ManualClock();
    const scheduler = new ManualScheduler(clock);
    const free = new Runner(model(), { scheduler, clock });
    const seeds = new Set<number | string>([free.sim.seed]);
    for (let i = 0; i < 5; i++) {
      free.restart();
      seeds.add(free.sim.seed);
    }
    expect(seeds.size).toBeGreaterThan(1);
  });

  it('an explicit seed in restart replaces the seed from then on', () => {
    const { runner } = rig({ seed: 1 });
    runner.restart({ seed: 'abc' });
    expect(runner.sim.seed).toBe('abc');
    runner.restart();
    expect(runner.sim.seed).toBe('abc');
  });

  it('applies and keeps parameter overrides, merging them', () => {
    const { runner } = rig({ parameters: { size: 3 } });
    expect(runner.sim.parameters.size).toBe(3);
    runner.restart();
    expect(runner.sim.parameters.size).toBe(3);
    runner.restart({ parameters: { size: 9 } });
    expect(runner.sim.parameters.size).toBe(9);
    runner.restart();
    expect(runner.sim.parameters.size).toBe(9);
  });

  it('discards the old simulation', () => {
    const { runner } = rig();
    const before = runner.sim;
    runner.step();
    runner.restart();
    expect(runner.sim).not.toBe(before);
    expect(runner.sim.tick).toBe(0);
  });

  it('an invalid override throws and leaves the runner untouched', () => {
    const { runner } = rig();
    const before = runner.sim;
    runner.step();
    expect(() => runner.restart({ parameters: { size: 1.5 } })).toThrow(ParameterError);
    expect(runner.sim).toBe(before);
    expect(runner.state).toBe('paused');
  });

  it('notifies frame listeners so views can redraw', () => {
    const { runner } = rig();
    const ticks: number[] = [];
    runner.onFrame((sim) => ticks.push(sim.tick));
    runner.step();
    runner.restart();
    expect(ticks).toEqual([1, 0]);
  });

  it('same seed gives the same run', () => {
    const run = () => {
      const out: number[] = [];
      const { runner } = rig({ seed: 5 }, (sim) => out.push(sim.random.int(0, 1000)));
      runner.step();
      runner.step();
      runner.restart();
      runner.step();
      return out;
    };
    const out = run();
    expect(out[2]).toBe(out[0]);
    expect(run()).toEqual(out);
  });
});

describe('Runner listeners', () => {
  it('calls frame listeners once per frame with the current sim', () => {
    const { runner, scheduler } = rig({ ticksPerSecond: 500 });
    const seen: Simulation[] = [];
    runner.onFrame((sim) => seen.push(sim as unknown as Simulation));
    runner.start();
    scheduler.runFrames(3);
    expect(seen).toHaveLength(3);
    expect(seen.every((sim) => sim === (runner.sim as unknown as Simulation))).toBe(true);
  });

  it('calls frame listeners after a manual step', () => {
    const { runner } = rig();
    let calls = 0;
    runner.onFrame(() => calls++);
    runner.step();
    runner.step();
    expect(calls).toBe(2);
  });

  it('unsubscribes', () => {
    const { runner, scheduler } = rig();
    let frames = 0;
    const states: string[] = [];
    const offFrame = runner.onFrame(() => frames++);
    const offState = runner.onStateChange((s) => states.push(s));
    runner.start();
    scheduler.runNext();
    offFrame();
    offState();
    offFrame();
    scheduler.runNext();
    runner.pause();
    expect(frames).toBe(1);
    expect(states).toEqual(['running']);
  });

  it('a listener can pause the runner from inside a frame', () => {
    const { runner, scheduler } = rig();
    runner.onFrame(() => runner.pause());
    runner.start();
    scheduler.runNext();
    expect(runner.state).toBe('paused');
    expect(scheduler.pending).toBe(0);
  });

  it('a listener can unsubscribe itself during notification', () => {
    const { runner } = rig();
    const calls: string[] = [];
    const off = runner.onFrame(() => {
      calls.push('a');
      off();
    });
    runner.onFrame(() => calls.push('b'));
    runner.step();
    runner.step();
    expect(calls).toEqual(['a', 'b', 'b']);
  });

  it('state listeners fire only on changes', () => {
    const { runner } = rig();
    const states: string[] = [];
    runner.onStateChange((s) => states.push(s));
    runner.restart();
    runner.pause();
    expect(states).toEqual([]);
  });
});

describe('Runner errors', () => {
  it('captures a model exception in a frame', () => {
    const boom = new Error('boom');
    const { runner, scheduler } = rig({ ticksPerSecond: 500 }, (sim) => {
      if (sim.tick === 2) throw boom;
    });
    const errors: unknown[] = [];
    const states: string[] = [];
    runner.onError((e) => errors.push(e));
    runner.onStateChange((s) => states.push(s));
    runner.start();
    expect(() => scheduler.runNext()).not.toThrow();
    expect(runner.state).toBe('stopped');
    expect(runner.error).toBe(boom);
    expect(runner.failed).toBe(true);
    expect(errors).toEqual([boom]);
    expect(states).toEqual(['running', 'stopped']);
    expect(scheduler.pending).toBe(0);
  });

  it('captures a model exception during a manual step', () => {
    const { runner } = rig({}, () => {
      throw new Error('bad step');
    });
    const errors: unknown[] = [];
    runner.onError((e) => errors.push(e));
    expect(runner.step()).toBe(false);
    expect(runner.state).toBe('stopped');
    expect((runner.error as Error).message).toBe('bad step');
    expect(errors).toHaveLength(1);
  });

  it('captures an exception thrown by a frame listener', () => {
    const { runner, scheduler } = rig();
    runner.onFrame(() => {
      throw new Error('listener');
    });
    runner.start();
    scheduler.runNext();
    expect(runner.state).toBe('stopped');
    expect((runner.error as Error).message).toBe('listener');
    expect(scheduler.pending).toBe(0);
  });

  it('survives a throwing error listener and unsubscribes', () => {
    const { runner } = rig({}, () => {
      throw new Error('x');
    });
    const errors: unknown[] = [];
    runner.onError(() => {
      throw new Error('in listener');
    });
    const off = runner.onError((e) => errors.push(e));
    runner.step();
    expect(errors).toHaveLength(1);
    off();
    runner.restart();
    runner.step();
    expect(errors).toHaveLength(1);
  });

  it('restart clears the error', () => {
    let fail = true;
    const { runner } = rig({}, () => {
      if (fail) throw new Error('x');
    });
    runner.step();
    expect(runner.failed).toBe(true);
    fail = false;
    runner.restart();
    expect(runner.failed).toBe(false);
    expect(runner.error).toBeUndefined();
    expect(runner.state).toBe('ready');
    expect(runner.step()).toBe(true);
  });
});

describe('Manual test helpers', () => {
  it('scheduler runs in order, honors cancel, and advances its clock by the delay', () => {
    const clock = new ManualClock(100);
    const scheduler = new ManualScheduler(clock);
    const order: string[] = [];
    scheduler.schedule(() => order.push('a'), 10);
    const cancel = scheduler.schedule(() => order.push('b'), 20);
    scheduler.schedule(() => order.push('c'), 30);
    cancel();
    expect(scheduler.pending).toBe(2);
    expect(scheduler.lastDelayMs).toBe(30);
    expect(scheduler.runFrames(5)).toBe(2);
    expect(order).toEqual(['a', 'c']);
    expect(clock.now()).toBe(140);
    expect(scheduler.runNext()).toBe(false);
  });
});
