// SPDX-License-Identifier: EPL-2.0
import { ParameterError, type ParameterSchema, type ParameterValues } from '../parameters';
import { RootScape, type Model } from '../root';
import { PerformanceClock, TimeoutScheduler, type Clock, type Scheduler } from './scheduler';

/** The lifecycle of a {@link Runner}. */
export type RunnerState = 'ready' | 'running' | 'paused' | 'stopped';

export interface RunnerOptions<S extends ParameterSchema> {
  /** Seed for the first run and for every restart. Default: a fresh seed for each run. */
  readonly seed?: number | string;
  readonly parameters?: Partial<ParameterValues<S>>;
  /** Passed to every root: stop automatically once this period has been reached. */
  readonly stopPeriod?: number;
  /** Target speed while running. Default 30. `Infinity` iterates as fast as the frame budget allows. */
  readonly iterationsPerSecond?: number;
  /** The most clock time one frame may spend iterating. Default 12 ms. */
  readonly frameBudgetMs?: number;
  /** Delay between frames. Default 1000/60 ms. */
  readonly frameIntervalMs?: number;
  /** Pause when the model reaches exactly this period while running. */
  readonly pausePeriod?: number;
  /**
   * Called with every root the runner creates, the first one and each
   * restart's, right after it is built and before anything is shown. Use it to
   * apply run-time settings (see `SettingsStore.attach`) so they survive
   * restarts. If it throws, a restart throws and leaves the runner untouched.
   */
  readonly onRoot?: (root: RootScape) => void;
  readonly scheduler?: Scheduler;
  readonly clock?: Clock;
}

/** What {@link Runner.restart} may change. */
export interface RestartOverrides<S extends ParameterSchema> {
  /** Becomes the runner's seed from now on. */
  readonly seed?: number | string;
  /** Merged over the runner's current parameter overrides, and kept for later restarts. */
  readonly parameters?: Partial<ParameterValues<S>>;
}

interface Entry<T> {
  readonly fn: T;
}

const DEFAULT_ITERATIONS_PER_SECOND = 30;
const DEFAULT_FRAME_BUDGET_MS = 12;
const DEFAULT_FRAME_INTERVAL_MS = 1000 / 60;
/** Absorbs floating-point error in the fractional iteration accumulator. */
const EPSILON = 1e-9;

function checkSpeed(iterationsPerSecond: number): void {
  if (Number.isNaN(iterationsPerSecond) || iterationsPerSecond <= 0) {
    throw new RangeError(
      `iterationsPerSecond must be positive or Infinity, got ${iterationsPerSecond}`,
    );
  }
}

/**
 * Runs one model interactively: start, pause, step, restart, and change
 * speed, with listeners for rendering. It is run-time plumbing and no part
 * of the model: each run is a fresh root scape. It uses an injected
 * {@link Scheduler} and {@link Clock}, so it works unchanged on a browser's
 * main thread, in a worker and in Node.
 *
 * States and transitions (an invalid transition is ignored and returns `false`
 * or does nothing; it never throws):
 *
 * - `ready`: fresh root at its start period. `start()` runs it; `step()`
 *   executes one iteration and leaves it `paused`.
 * - `running`: frames are scheduled. `pause()` pauses. `start()` and `step()` are ignored.
 * - `paused`: `start()` resumes; `step()` executes one iteration.
 * - `stopped`: the model stopped itself, or an error occurred. Only
 *   `restart()` leaves this state; `start()`, `pause()` and `step()` are ignored.
 * - `restart()` works in every state except after `dispose()`.
 *
 * While running, each frame accrues iterations from the clock time since the
 * previous frame (fractions carry over), never iterates for longer than
 * `frameBudgetMs`, and drops any backlog the budget prevented it from working
 * off. At least one iteration is executed per frame whenever one is due. A
 * frame ends with one call to the frame listeners. With `Infinity` speed a
 * frame iterates until the budget is used, so the clock must advance for the
 * frame to end.
 */
export class Runner<S extends ParameterSchema = ParameterSchema> {
  readonly model: Model<S>;
  /** Pause when the model reaches exactly this period while running. May be changed at any time. */
  pausePeriod: number | undefined;

  readonly #stopPeriod: number | undefined;
  readonly #onRoot: ((root: RootScape) => void) | undefined;
  readonly #scheduler: Scheduler;
  readonly #clock: Clock;
  readonly #budgetMs: number;
  readonly #intervalMs: number;
  readonly #frameListeners: Entry<(root: RootScape<S>) => void>[] = [];
  readonly #stateListeners: Entry<(state: RunnerState) => void>[] = [];
  readonly #errorListeners: Entry<(error: unknown) => void>[] = [];
  #seed: number | string | undefined;
  #parameters: Partial<ParameterValues<S>> | undefined;
  #speed: number;
  #root: RootScape<S>;
  #state: RunnerState = 'ready';
  #error: unknown;
  #hasError = false;
  #cancel: (() => void) | undefined;
  #accrued = 0;
  #lastFrameAt = 0;
  #disposed = false;

  /** Creates the first root immediately; the runner starts `ready`. */
  constructor(model: Model<S>, options: RunnerOptions<S> = {}) {
    this.model = model;
    this.#seed = options.seed;
    this.#parameters = options.parameters;
    this.#stopPeriod = options.stopPeriod;
    this.#onRoot = options.onRoot;
    this.pausePeriod = options.pausePeriod;
    this.#speed = options.iterationsPerSecond ?? DEFAULT_ITERATIONS_PER_SECOND;
    checkSpeed(this.#speed);
    this.#budgetMs = options.frameBudgetMs ?? DEFAULT_FRAME_BUDGET_MS;
    this.#intervalMs = options.frameIntervalMs ?? DEFAULT_FRAME_INTERVAL_MS;
    this.#scheduler = options.scheduler ?? new TimeoutScheduler();
    this.#clock = options.clock ?? new PerformanceClock();
    this.#root = this.#create(this.#seed, this.#parameters);
  }

  /** The root scape of the current run; replaced by {@link restart}. */
  get root(): RootScape<S> {
    return this.#root;
  }

  get state(): RunnerState {
    return this.#state;
  }

  /** Target iterations per second. */
  get iterationsPerSecond(): number {
    return this.#speed;
  }

  /** The exception that stopped the runner, if any. Cleared by {@link restart}. */
  get error(): unknown {
    return this.#error;
  }

  /** Whether {@link error} holds a thrown value (which may itself be `undefined`). */
  get failed(): boolean {
    return this.#hasError;
  }

  /** Begins or resumes running. Ignored unless `ready` or `paused`. */
  start(): void {
    if (this.#disposed || (this.#state !== 'ready' && this.#state !== 'paused')) return;
    this.#lastFrameAt = this.#clock.now();
    this.#accrued = 0;
    this.#setState('running');
    this.#scheduleFrame();
  }

  /** Pauses. Ignored unless `running`. */
  pause(): void {
    if (this.#disposed || this.#state !== 'running') return;
    this.#cancelFrame();
    this.#setState('paused');
  }

  /**
   * Executes exactly one iteration, then calls the frame listeners. Valid when `ready`
   * (which becomes `paused`) or `paused`; otherwise ignored. Returns whether an iteration ran.
   */
  step(): boolean {
    if (this.#disposed || (this.#state !== 'ready' && this.#state !== 'paused')) return false;
    try {
      if (this.#state === 'ready') this.#setState('paused');
      const ran = this.#iterate();
      this.#notifyFrame();
      return ran;
    } catch (error) {
      this.#fail(error);
      return false;
    }
  }

  /**
   * Discards the root and builds a fresh one. A seed passed to the
   * constructor or here is reused; without one, each run gets a new seed.
   * Parameter overrides are merged over earlier ones and kept. If the new
   * root cannot be built (for example an invalid parameter) the error is
   * thrown and the runner is left untouched. Ends `ready`, or `running` if it
   * was running; frame listeners are called so views can redraw.
   */
  restart(overrides: RestartOverrides<S> = {}): void {
    if (this.#disposed) return;
    const seed = overrides.seed ?? this.#seed;
    const parameters = overrides.parameters
      ? { ...this.#parameters, ...overrides.parameters }
      : this.#parameters;
    const root = this.#create(seed, parameters);
    this.#seed = seed;
    this.#parameters = parameters;
    this.#root = root;
    this.#error = undefined;
    this.#hasError = false;
    this.#accrued = 0;
    this.#lastFrameAt = this.#clock.now();
    if (this.#state === 'running') {
      this.#cancelFrame();
      this.#scheduleFrame();
    } else {
      this.#setState('ready');
    }
    try {
      this.#notifyFrame();
    } catch (error) {
      this.#fail(error);
    }
  }

  /**
   * Changes a parameter of the running model that is declared `live`, one
   * the model reads as it runs, and keeps the value for later restarts. A
   * parameter that is not live shapes the model when it is built, so the
   * runner refuses it here: give it to {@link restart}. Throws a
   * `ParameterError`, changing nothing, if the parameter is not live or the
   * value does not fit. Frame listeners are called so views can update.
   */
  setParameter(name: string, value: number | string | boolean): void {
    if (this.#disposed) return;
    const parameter = (this.model.parameters as ParameterSchema)[name];
    if (parameter && !parameter.live) {
      throw new ParameterError(`Parameter "${name}" is not live; it applies on restart`);
    }
    this.#root.setParameter(name, value);
    this.#parameters = { ...this.#parameters, [name]: value } as unknown as Partial<
      ParameterValues<S>
    >;
    this.#notifyFrame();
  }

  /** The parameter overrides used for the current run and kept for restarts. */
  get parameterOverrides(): Partial<ParameterValues<S>> {
    return { ...this.#parameters } as Partial<ParameterValues<S>>;
  }

  /** The seed given to the constructor or the last restart, if any. */
  get fixedSeed(): number | string | undefined {
    return this.#seed;
  }

  /** Changes the target speed. Throws a `RangeError` unless positive or `Infinity`. */
  setSpeed(iterationsPerSecond: number): void {
    checkSpeed(iterationsPerSecond);
    this.#speed = iterationsPerSecond;
    this.#accrued = 0;
  }

  /** Stops everything and drops all listeners. The runner ends `stopped` and ignores further calls. */
  dispose(): void {
    if (this.#disposed) return;
    this.#cancelFrame();
    this.#setState('stopped');
    this.#disposed = true;
    this.#frameListeners.length = 0;
    this.#stateListeners.length = 0;
    this.#errorListeners.length = 0;
  }

  /** Called after each frame or manual step, and after a restart. Returns an unsubscribe function. */
  onFrame(listener: (root: RootScape<S>) => void): () => void {
    return this.#subscribe(this.#frameListeners, listener);
  }

  /** Called whenever {@link state} changes. Returns an unsubscribe function. */
  onStateChange(listener: (state: RunnerState) => void): () => void {
    return this.#subscribe(this.#stateListeners, listener);
  }

  /** Called when model or listener code throws during a frame or step. Returns an unsubscribe function. */
  onError(listener: (error: unknown) => void): () => void {
    return this.#subscribe(this.#errorListeners, listener);
  }

  #create(
    seed: number | string | undefined,
    parameters: Partial<ParameterValues<S>> | undefined,
  ): RootScape<S> {
    const root = new RootScape(this.model, {
      ...(seed !== undefined && { seed }),
      ...(parameters !== undefined && { parameters }),
      ...(this.#stopPeriod !== undefined && { stopPeriod: this.#stopPeriod }),
    });
    this.#onRoot?.(root as unknown as RootScape);
    return root;
  }

  #subscribe<T>(list: Entry<T>[], fn: T): () => void {
    const entry: Entry<T> = { fn };
    list.push(entry);
    return () => {
      const index = list.indexOf(entry);
      if (index >= 0) list.splice(index, 1);
    };
  }

  #setState(next: RunnerState): void {
    if (this.#state === next) return;
    this.#state = next;
    for (const { fn } of [...this.#stateListeners]) fn(next);
  }

  #notifyFrame(): void {
    for (const { fn } of [...this.#frameListeners]) fn(this.#root);
  }

  #scheduleFrame(): void {
    const delay = this.#speed === Infinity ? 0 : this.#intervalMs;
    this.#cancel = this.#scheduler.schedule(() => {
      this.#cancel = undefined;
      this.#frame();
    }, delay);
  }

  #cancelFrame(): void {
    this.#cancel?.();
    this.#cancel = undefined;
  }

  /** One iteration, then the state changes it implies. Returns false if the model had already stopped. */
  #iterate(): boolean {
    const root = this.#root;
    if (!root.iterate()) {
      this.#setState('stopped');
      return false;
    }
    if (root.stopped) this.#setState('stopped');
    else if (this.pausePeriod !== undefined && root.period === this.pausePeriod) {
      this.#cancelFrame();
      this.#setState('paused');
    }
    return true;
  }

  #frame(): void {
    if (this.#state !== 'running') return;
    try {
      const start = this.#clock.now();
      let due: number;
      if (this.#speed === Infinity) {
        due = Infinity;
      } else {
        this.#accrued += (Math.max(0, start - this.#lastFrameAt) * this.#speed) / 1000;
        due = Math.floor(this.#accrued + EPSILON);
        this.#accrued = Math.max(0, this.#accrued - due);
      }
      this.#lastFrameAt = start;
      for (let ran = 0; ran < due;) {
        if (!this.#iterate()) break;
        ran++;
        if (this.#state !== 'running') break;
        if (ran < due && this.#clock.now() - start >= this.#budgetMs) break;
      }
      if (this.#state === 'running') this.#scheduleFrame();
      this.#notifyFrame();
    } catch (error) {
      this.#fail(error);
    }
  }

  #fail(error: unknown): void {
    this.#cancelFrame();
    this.#error = error;
    this.#hasError = true;
    try {
      this.#setState('stopped');
    } catch {
      // A throwing state listener must not hide the original error.
    }
    for (const { fn } of [...this.#errorListeners]) {
      try {
        fn(error);
      } catch {
        // An error listener that throws cannot be reported to anyone.
      }
    }
  }
}
