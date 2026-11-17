// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import { defineModel, int, ParameterError, real, Scape, Singleton, type RootScape } from '..';
import { ManualClock, ManualScheduler, Runner, type RunnerOptions } from './index';

/** A model with no agents; `onStep` is a rule of the model as a whole, executed each iteration. */
const model = (onStep?: (root: RootScape) => void) =>
  defineModel({
    name: 'counter',
    parameters: { size: int(1) },
    build(root) {
      root
        .add(new Scape({ name: 'counter', space: new Singleton() }))
        .addRule('on step', () => onStep?.(root as unknown as RootScape));
    },
  });

function rig(
  options: Partial<RunnerOptions<{ size: ReturnType<typeof int> }>> = {},
  onStep?: (root: RootScape, clock: ManualClock) => void,
) {
  const clock = new ManualClock();
  const scheduler = new ManualScheduler(clock);
  const runner = new Runner(
    model((root) => onStep?.(root, clock)),
    { seed: 1, scheduler, clock, frameIntervalMs: 20, ...options },
  );
  return { clock, scheduler, runner };
}

describe('Runner states', () => {
  it('starts ready at iteration 0 with a root', () => {
    const { runner, scheduler } = rig();
    expect(runner.state).toBe('ready');
    expect(runner.root.period).toBe(0);
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
    expect(runner.root.period).toBe(0);
    runner.pause();
    runner.pause();
    expect(runner.state).toBe('paused');
  });

  it('step runs one iteration from ready (becoming paused) and from paused', () => {
    const { runner } = rig();
    const states: string[] = [];
    runner.onStateChange((s) => states.push(s));
    expect(runner.step()).toBe(true);
    expect(runner.state).toBe('paused');
    expect(runner.root.period).toBe(1);
    expect(runner.step()).toBe(true);
    expect(runner.root.period).toBe(2);
    expect(states).toEqual(['paused']);
  });

  it('a stopped runner ignores start, pause and step, but restarts', () => {
    const { runner, scheduler } = rig({ stopPeriod: 1 });
    runner.step();
    expect(runner.state).toBe('stopped');
    runner.start();
    runner.pause();
    expect(runner.step()).toBe(false);
    expect(runner.state).toBe('stopped');
    expect(scheduler.pending).toBe(0);
    runner.restart();
    expect(runner.state).toBe('ready');
    expect(runner.root.period).toBe(0);
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
    expect(runner.root.period).toBe(0);
    expect(scheduler.pending).toBe(1);
  });

  it('stops when the model stops itself', () => {
    const { runner, scheduler } = rig({ iterationsPerSecond: 60 }, (root) => {
      if (root.period === 3) root.stop('done');
    });
    runner.start();
    scheduler.runFrames(10);
    expect(runner.state).toBe('stopped');
    expect(runner.root.period).toBe(3);
    expect(runner.root.stopReason).toBe('done');
    expect(scheduler.pending).toBe(0);
  });

  it('stops at stopPeriod', () => {
    const { runner, scheduler } = rig({ stopPeriod: 5, iterationsPerSecond: 600 });
    runner.start();
    scheduler.runNext();
    expect(runner.root.period).toBe(5);
    expect(runner.state).toBe('stopped');
  });

  it('keeps a stop period and stop conditions given to restart', () => {
    const { runner } = rig({ stopPeriod: 2 });
    runner.restart({
      stopPeriod: null,
      stopWhen: [{ reason: 'four', holds: (r) => r.period === 4 }],
    });
    while (runner.step());
    expect(runner.root.period).toBe(4);
    expect(runner.root.stopReason).toBe('four');
    runner.restart({ stopPeriod: 3 });
    while (runner.step());
    expect(runner.root.period).toBe(3);
    runner.restart({ stopPeriod: null, stopWhen: null });
    for (let i = 0; i < 6; i++) runner.step();
    expect(runner.root.period).toBe(6);
    expect(runner.state).toBe('paused');
  });

  it('a model that stops while building stops on the first frame', () => {
    const clock = new ManualClock();
    const scheduler = new ManualScheduler(clock);
    const runner = new Runner(
      defineModel({
        name: 'early',
        parameters: {},
        build(root) {
          root.stop();
        },
      }),
      { scheduler, clock, iterationsPerSecond: 600 },
    );
    runner.start();
    scheduler.runNext();
    expect(runner.state).toBe('stopped');
  });

  it('pausePeriod pauses exactly at that iteration and resumes past it', () => {
    const { runner, scheduler } = rig({ iterationsPerSecond: 300, pausePeriod: 4 });
    runner.start();
    scheduler.runNext();
    expect(runner.root.period).toBe(4);
    expect(runner.state).toBe('paused');
    expect(scheduler.pending).toBe(0);
    runner.start();
    scheduler.runNext();
    expect(runner.root.period).toBe(4 + 6);
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
  it('runs 30 iterations/s at 50 frames/s with fractional carry', () => {
    const { runner, scheduler } = rig({ iterationsPerSecond: 30 });
    const frames: number[] = [];
    runner.onFrame((root) => frames.push(root.period));
    runner.start();
    scheduler.runFrames(10);
    // 0.6 iterations per frame: 0, 1, 1, 2, 3, 3, 4, 4, 5, 6 cumulative.
    expect(frames).toEqual([0, 1, 1, 2, 3, 3, 4, 4, 5, 6]);
    scheduler.runFrames(40);
    expect(runner.root.period).toBe(30);
  });

  it('runs 30 iterations/s at 60 frames/s', () => {
    const { runner, scheduler } = rig({ iterationsPerSecond: 30, frameIntervalMs: 1000 / 60 });
    runner.start();
    scheduler.runFrames(60);
    expect(runner.root.period).toBe(30);
    scheduler.runFrames(2);
    expect(runner.root.period).toBe(31);
  });

  it('runs several iterations per frame at high speed', () => {
    const { runner, scheduler } = rig({ iterationsPerSecond: 500 });
    runner.start();
    scheduler.runFrames(3);
    expect(runner.root.period).toBe(30);
  });

  it('runs slow speeds one iteration every few frames', () => {
    const { runner, scheduler } = rig({ iterationsPerSecond: 5 });
    runner.start();
    scheduler.runFrames(9);
    expect(runner.root.period).toBe(0);
    scheduler.runFrames(1);
    expect(runner.root.period).toBe(1);
    scheduler.runFrames(10);
    expect(runner.root.period).toBe(2);
  });

  it('setSpeed changes the pace', () => {
    const { runner, scheduler } = rig({ iterationsPerSecond: 50 });
    runner.start();
    scheduler.runFrames(2);
    expect(runner.root.period).toBe(2);
    runner.setSpeed(100);
    expect(runner.iterationsPerSecond).toBe(100);
    scheduler.runFrames(2);
    expect(runner.root.period).toBe(6);
  });

  it('rejects invalid speeds', () => {
    const { runner } = rig();
    expect(() => runner.setSpeed(0)).toThrow(RangeError);
    expect(() => runner.setSpeed(-1)).toThrow(RangeError);
    expect(() => runner.setSpeed(NaN)).toThrow(RangeError);
    expect(() => rig({ iterationsPerSecond: 0 })).toThrow(RangeError);
  });

  it('cuts a frame short at the budget and drops the backlog', () => {
    // 1000 iterations/s with 20 ms frames is 20 iterations due; each iteration costs 1 ms; budget 5 ms.
    const { runner, scheduler } = rig({ iterationsPerSecond: 1000, frameBudgetMs: 5 }, (_, clock) =>
      clock.advance(1),
    );
    runner.start();
    scheduler.runNext();
    expect(runner.root.period).toBe(5);
    // The backlog is not carried over: the next frame is again limited to 5 iterations.
    scheduler.runNext();
    expect(runner.root.period).toBe(10);
  });

  it('always runs at least one iteration per frame, even with a tiny budget', () => {
    const { runner, scheduler } = rig({ iterationsPerSecond: 1000, frameBudgetMs: 0 });
    runner.start();
    scheduler.runNext();
    expect(runner.root.period).toBe(1);
  });

  it('steps until the budget is used at Infinity speed', () => {
    const { runner, scheduler } = rig(
      { iterationsPerSecond: Infinity, frameBudgetMs: 12 },
      (_, clock) => clock.advance(2),
    );
    let frames = 0;
    runner.onFrame(() => frames++);
    runner.start();
    scheduler.runNext();
    expect(runner.root.period).toBe(6);
    expect(frames).toBe(1);
    expect(scheduler.lastDelayMs).toBe(0);
    scheduler.runNext();
    expect(runner.root.period).toBe(12);
  });

  it('Infinity speed still honors pausePeriod and stopPeriod', () => {
    const a = rig({ iterationsPerSecond: Infinity, pausePeriod: 7 }, (_, c) => c.advance(1));
    a.runner.start();
    a.scheduler.runNext();
    expect(a.runner.root.period).toBe(7);
    expect(a.runner.state).toBe('paused');
    const b = rig({ iterationsPerSecond: Infinity, stopPeriod: 4 }, (_, c) => c.advance(1));
    b.runner.start();
    b.scheduler.runNext();
    expect(b.runner.state).toBe('stopped');
    expect(b.runner.root.period).toBe(4);
  });

  it('does not count time spent paused', () => {
    const { runner, scheduler, clock } = rig({ iterationsPerSecond: 50 });
    runner.start();
    scheduler.runFrames(1);
    runner.pause();
    clock.advance(10_000);
    runner.start();
    scheduler.runFrames(1);
    expect(runner.root.period).toBe(2);
  });
});

describe('Runner restart', () => {
  it('keeps an explicit seed and regenerates an unspecified one', () => {
    const fixed = rig({ seed: 42 });
    fixed.runner.restart();
    expect(fixed.runner.root.seed).toBe(42);

    const clock = new ManualClock();
    const scheduler = new ManualScheduler(clock);
    const free = new Runner(model(), { scheduler, clock });
    const seeds = new Set<number | string>([free.root.seed]);
    for (let i = 0; i < 5; i++) {
      free.restart();
      seeds.add(free.root.seed);
    }
    expect(seeds.size).toBeGreaterThan(1);
  });

  it('an explicit seed in restart replaces the seed from then on', () => {
    const { runner } = rig({ seed: 1 });
    runner.restart({ seed: 'abc' });
    expect(runner.root.seed).toBe('abc');
    runner.restart();
    expect(runner.root.seed).toBe('abc');
  });

  it('applies and keeps parameter overrides, merging them', () => {
    const { runner } = rig({ parameters: { size: 3 } });
    expect(runner.root.parameters.size).toBe(3);
    runner.restart();
    expect(runner.root.parameters.size).toBe(3);
    runner.restart({ parameters: { size: 9 } });
    expect(runner.root.parameters.size).toBe(9);
    runner.restart();
    expect(runner.root.parameters.size).toBe(9);
  });

  it('discards the old root', () => {
    const { runner } = rig();
    const before = runner.root;
    runner.step();
    runner.restart();
    expect(runner.root).not.toBe(before);
    expect(runner.root.period).toBe(0);
  });

  it('an invalid override throws and leaves the runner untouched', () => {
    const { runner } = rig();
    const before = runner.root;
    runner.step();
    expect(() => runner.restart({ parameters: { size: 1.5 } })).toThrow(ParameterError);
    expect(runner.root).toBe(before);
    expect(runner.state).toBe('paused');
  });

  it('notifies frame listeners so views can redraw', () => {
    const { runner } = rig();
    const iterations: number[] = [];
    runner.onFrame((root) => iterations.push(root.period));
    runner.step();
    runner.restart();
    expect(iterations).toEqual([1, 0]);
  });

  it('same seed gives the same run', () => {
    const run = () => {
      const out: number[] = [];
      const { runner } = rig({ seed: 5 }, (root) => out.push(root.random.int(0, 1000)));
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
  it('calls frame listeners once per frame with the current root', () => {
    const { runner, scheduler } = rig({ iterationsPerSecond: 500 });
    const seen: RootScape[] = [];
    runner.onFrame((root) => seen.push(root as unknown as RootScape));
    runner.start();
    scheduler.runFrames(3);
    expect(seen).toHaveLength(3);
    expect(seen.every((root) => root === (runner.root as unknown as RootScape))).toBe(true);
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
    const { runner, scheduler } = rig({ iterationsPerSecond: 500 }, (root) => {
      if (root.period === 2) throw boom;
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

describe('Runner live parameters', () => {
  const liveModel = defineModel({
    name: 'live',
    parameters: { rate: real(1, { live: true }), size: int(2) },
    build() {},
  });

  it('changes a live parameter now and keeps it for restarts', () => {
    const runner = new Runner(liveModel, { scheduler: new ManualScheduler() });
    let frames = 0;
    runner.onFrame(() => frames++);
    runner.setParameter('rate', 3);
    expect(runner.root.parameters.rate).toBe(3);
    expect(frames).toBe(1);
    runner.restart();
    expect(runner.root.parameters.rate).toBe(3);
    expect(runner.parameterOverrides).toEqual({ rate: 3 });
    expect(() => runner.setParameter('size', 3)).toThrow(/not live/);
  });
});
