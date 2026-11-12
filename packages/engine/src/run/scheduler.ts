// SPDX-License-Identifier: EPL-2.0

/** Runs a callback later. Injected into the runner so that tests (and hosts) control time. */
export interface Scheduler {
  /** Arranges for `callback` to run once after about `delayMs`; returns a function that cancels it. */
  schedule(callback: () => void, delayMs: number): () => void;
}

/** A source of monotonic time in milliseconds. */
export interface Clock {
  now(): number;
}

/** The few host globals used by the default scheduler and clock; present in browsers, workers and Node. */
interface TimingGlobals {
  setTimeout?: (callback: () => void, delayMs: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  performance?: { now(): number };
}

const host = globalThis as unknown as TimingGlobals;

/** The default {@link Scheduler}, backed by the host's `setTimeout`. */
export class TimeoutScheduler implements Scheduler {
  schedule(callback: () => void, delayMs: number): () => void {
    const { setTimeout, clearTimeout } = host;
    if (!setTimeout || !clearTimeout) {
      throw new Error('No setTimeout in this environment; supply a scheduler');
    }
    const handle = setTimeout(callback, delayMs);
    return () => clearTimeout(handle);
  }
}

/** The default {@link Clock}, backed by the host's `performance.now()`. */
export class PerformanceClock implements Clock {
  now(): number {
    if (!host.performance)
      throw new Error('No performance.now in this environment; supply a clock');
    return host.performance.now();
  }
}

/** A clock that only moves when told to. For tests. */
export class ManualClock implements Clock {
  #time: number;

  constructor(start = 0) {
    this.#time = start;
  }

  now(): number {
    return this.#time;
  }

  /** Moves time forward by `ms`. */
  advance(ms: number): void {
    this.#time += ms;
  }
}

interface Task {
  readonly callback: () => void;
  readonly delayMs: number;
}

/**
 * A scheduler that never runs anything by itself. For tests: call
 * {@link runNext} to run the earliest scheduled callback.
 *
 * If constructed with a {@link ManualClock}, running a task first advances that
 * clock by the task's delay, which simulates real time passing between frames.
 */
export class ManualScheduler implements Scheduler {
  readonly #clock: ManualClock | undefined;
  readonly #tasks: Task[] = [];
  #lastDelayMs: number | undefined;

  constructor(clock?: ManualClock) {
    this.#clock = clock;
  }

  schedule(callback: () => void, delayMs: number): () => void {
    const task: Task = { callback, delayMs };
    this.#tasks.push(task);
    this.#lastDelayMs = delayMs;
    return () => {
      const index = this.#tasks.indexOf(task);
      if (index >= 0) this.#tasks.splice(index, 1);
    };
  }

  /** How many callbacks are waiting. */
  get pending(): number {
    return this.#tasks.length;
  }

  /** The delay requested by the most recent `schedule` call. */
  get lastDelayMs(): number | undefined {
    return this.#lastDelayMs;
  }

  /** Runs the earliest waiting callback. Returns false if there was none. */
  runNext(): boolean {
    const task = this.#tasks.shift();
    if (!task) return false;
    this.#clock?.advance(task.delayMs);
    task.callback();
    return true;
  }

  /** Runs `count` frames (or fewer, if the queue runs dry). Returns how many ran. */
  runFrames(count: number): number {
    let ran = 0;
    while (ran < count && this.runNext()) ran++;
    return ran;
  }
}
