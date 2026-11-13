// SPDX-License-Identifier: EPL-2.0
import type { Agent } from './agent';
import { DataRecorder } from './data/recorder';
import {
  ParameterError,
  resolveParameters,
  type ParameterSchema,
  type ParameterValues,
} from './parameters';
import { Random } from './random';
import type { Scape } from './scape';
import type { ViewSpec } from './view/spec';

/**
 * Where a model comes from. Tools show this next to the model, so that credit
 * for the science and for any earlier implementation always travels with it.
 */
export interface Provenance {
  /** Who devised the model, such as "Joshua M. Epstein and Robert Axtell". */
  readonly authors?: string;
  /** The publication that defines the model. */
  readonly citation?: string;
  /** The earlier implementation this one was ported from, such as "Ascape 5.6.1, edu.brook.sugarscape.GAS_II_1". */
  readonly portedFrom?: string;
  /** The copyright notice of that earlier implementation. */
  readonly copyright?: string;
  /** Anything else a user should know, such as how this version differs from the original. */
  readonly note?: string;
}

/**
 * How a model's steps map onto its own time, such as one year per step
 * starting in AD 800. Tools use it to label time; ticks stay the engine's unit.
 */
export interface TimeScale<S extends ParameterSchema = ParameterSchema> {
  /** One step's unit, singular, such as "year". */
  readonly unit: string;
  /** Plural of `unit`; default `unit` + "s". */
  readonly plural?: string;
  /** The time at tick 0. Default 0; see also {@link TimeScale.originOf}. */
  readonly origin?: number;
  /** The time at tick 0 when it depends on the parameters; takes precedence over `origin`. */
  originOf?(parameters: ParameterValues<S>): number;
  /** Time per step. Default 1. */
  readonly step?: number;
}

/** A change to rules that an {@link Exploration} makes. */
export interface ExplorationRules {
  /** Scape name. */
  readonly scape: string;
  /** Rule names to switch on. */
  readonly enable?: readonly string[];
  /** Rule names to switch off. */
  readonly disable?: readonly string[];
}

/**
 * A "thing to try": a small change, applied in one action, that shows something
 * about the model, such as switching off a rule or setting vision to 1.
 */
export interface Exploration<S extends ParameterSchema = ParameterSchema> {
  readonly title: string;
  /** What to look for once it is applied. */
  readonly description?: string;
  /** Parameter values to set; non-live parameters apply on restart. */
  readonly parameters?: Partial<ParameterValues<S>>;
  readonly rules?: readonly ExplorationRules[];
}

/**
 * A model: its declared parameters and how to build its world.
 *
 * `build` adds scapes, rules and observers to a fresh simulation. It must not
 * keep state outside the simulation, so that every run starts clean.
 */
export interface Model<S extends ParameterSchema = ParameterSchema> {
  readonly name: string;
  readonly description?: string;
  /** Who devised the model and where this implementation comes from. */
  readonly provenance?: Provenance;
  /** One line for galleries and lists; defaults to the first sentence of `description`. */
  readonly summary?: string;
  /** Topics, such as "epidemics" or "game theory", for finding the model. */
  readonly tags?: readonly string[];
  /** The model's own unit of time. Default: ticks. */
  readonly time?: TimeScale<S>;
  /** Small changes worth trying, each applied in one action. */
  readonly explorations?: readonly Exploration<S>[];
  /** Readable names for agent fields shown by inspectors; `null` hides a field. */
  readonly fields?: Readonly<Record<string, string | null>>;
  readonly parameters: S;
  build(sim: Simulation<S>): void;
  /**
   * Further views of a run, besides those `build` declares with
   * `sim.addView`. Called once per simulation, after it is initialized.
   * Prefer `sim.addView` inside `build`, where the model's scapes are in scope.
   */
  views?(sim: Simulation<S>): ViewSpec[];
}

/** Declares a model, inferring its parameter types from the schema. */
export function defineModel<const S extends ParameterSchema>(model: Model<S>): Model<S> {
  return model;
}

export interface SimulationOptions<S extends ParameterSchema> {
  /** Determines every random choice in the run. Default: a fresh seed, recorded in `sim.seed`. */
  readonly seed?: number | string;
  /** Overrides for the model's parameter defaults. */
  readonly parameters?: Partial<ParameterValues<S>>;
  /** Stop automatically once this tick has been executed. */
  readonly stopAt?: number;
}

/** Receives notifications as a simulation progresses. All methods are optional. */
export interface SimulationObserver {
  /** The initial population exists and initial rules have run; `tick` is 0. */
  initialized?(sim: Simulation): void;
  /** A step has completed; `sim.tick` is the tick just executed. */
  stepped?(sim: Simulation): void;
  /** The simulation has stopped and will not step again. */
  stopped?(sim: Simulation): void;
}

/**
 * One run of a model: fully determined by the model, its parameters and the seed.
 *
 * Construction builds and initializes the world, leaving the simulation at
 * tick 0. Each {@link step} advances one tick. To run a model again, create a
 * new simulation.
 */
export class Simulation<S extends ParameterSchema = ParameterSchema> {
  readonly model: Model<S>;
  readonly seed: number | string;
  /** The root random stream. Scapes get their own streams forked from it. */
  readonly random: Random;
  readonly stopAt: number | undefined;
  /**
   * The run's recorded data. Models declare what to measure on it while they
   * are built; it samples at tick 0 and after every step.
   */
  readonly data: DataRecorder;

  readonly #scapes: Scape<Agent>[] = [];
  readonly #observers: SimulationObserver[] = [];
  readonly #declaredViews: ViewSpec[] = [];
  readonly #setups: (() => void)[] = [];
  #views: readonly ViewSpec[] | undefined;
  #parameters: ParameterValues<S>;
  #tick = 0;
  #nextAgentId = 0;
  #building = true;
  #stopped = false;
  #stopReason: string | undefined;

  constructor(model: Model<S>, options: SimulationOptions<S> = {}) {
    this.model = model;
    this.#parameters = resolveParameters(model.parameters, options.parameters);
    // The only use of ambient entropy: choosing a seed when none is given.
    // eslint-disable-next-line no-restricted-properties
    this.seed = options.seed ?? Math.floor(Math.random() * 0x1_0000_0000);
    this.random = new Random(this.seed);
    this.stopAt = options.stopAt;

    this.data = new DataRecorder(this as unknown as Simulation);

    model.build(this);
    this.#building = false;

    for (const scape of this.#scapes) scape.populate();
    for (const scape of this.#scapes) scape.initializeMembers();
    for (const scape of this.#scapes) scape.runInitialRules();
    for (const setup of this.#setups) setup();
    this.#notify('initialized');
  }

  /** The resolved parameter values. Read them as the run goes to see live changes. */
  get parameters(): ParameterValues<S> {
    return this.#parameters;
  }

  /**
   * Changes a parameter declared `live` while the simulation runs. The model
   * sees the new value wherever it reads `sim.parameters` from now on. Throws a
   * `ParameterError` for a parameter that is not live or a value that does not
   * fit, changing nothing.
   */
  setParameter(name: string, value: number | string | boolean): void {
    const parameter = (this.model.parameters as ParameterSchema)[name];
    if (!parameter) throw new ParameterError(`Unknown parameter "${name}"`);
    if (!parameter.live) {
      throw new ParameterError(`Parameter "${name}" is not live; it applies on restart`);
    }
    this.#parameters = resolveParameters(this.model.parameters, {
      ...this.#parameters,
      [name]: value,
    } as Partial<ParameterValues<S>>);
  }

  /** The number of steps executed so far. */
  get tick(): number {
    return this.#tick;
  }

  get stopped(): boolean {
    return this.#stopped;
  }

  /** Why the simulation stopped, if a reason was given. */
  get stopReason(): string | undefined {
    return this.#stopReason;
  }

  /** The scapes, in the order they were added, which is the order they step in. */
  get scapes(): readonly Scape<Agent>[] {
    return this.#scapes;
  }

  /** Adds a scape. Only allowed while the model is being built. */
  // `any` lets a scape of any agent type be passed and returned with its own type intact.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addScape<T extends Scape<any>>(scape: T): T {
    if (!this.#building) throw new Error('Scapes can only be added while the model is built');
    const added: Scape<Agent> = scape;
    if (this.#scapes.some((existing) => existing.name === added.name)) {
      throw new Error(`A scape named "${added.name}" already exists`);
    }
    added.attach(this as unknown as Simulation, this.random.fork());
    this.#scapes.push(added);
    return scape;
  }

  /** Finds a scape by name. */
  scape(name: string): Scape<Agent> {
    const found = this.#scapes.find((scape) => scape.name === name);
    if (!found) throw new Error(`No scape named "${name}"`);
    return found;
  }

  /**
   * Registers work to do once the initial population exists: after every
   * scape is populated, its members initialized and initial rules run, but
   * before the first data sample at tick 0. Use it for set-up that spans
   * agents, such as wiring a network or seeding an infection. Called by
   * models while they are built; callbacks run in the order registered.
   */
  setup(callback: () => void): this {
    if (!this.#building) throw new Error('Setup can only be registered while the model is built');
    this.#setups.push(callback);
    return this;
  }

  /**
   * Declares how this run should be shown: a lattice, a chart and so on.
   * Called by models while they are built, typically with the helpers
   * `gridView`, `timeSeriesView` and friends.
   */
  addView(view: ViewSpec): this {
    if (!this.#building) throw new Error('Views can only be added while the model is built');
    this.#declaredViews.push(view);
    return this;
  }

  /** The views of this run: those declared with `addView`, then any from `model.views`. */
  get views(): readonly ViewSpec[] {
    this.#views ??= [...this.#declaredViews, ...(this.model.views?.(this) ?? [])];
    return this.#views;
  }

  /** Registers an observer; returns a function that removes it again. */
  observe(observer: SimulationObserver): () => void {
    this.#observers.push(observer);
    return () => {
      const index = this.#observers.indexOf(observer);
      if (index >= 0) this.#observers.splice(index, 1);
    };
  }

  /**
   * Advances one tick: every scape steps in order, then observers are told.
   * Returns false, doing nothing, if the simulation has stopped.
   */
  step(): boolean {
    if (this.#stopped) return false;
    this.#tick++;
    for (const scape of this.#scapes) scape.step();
    this.#notify('stepped');
    if (this.stopAt !== undefined && this.#tick >= this.stopAt) this.stop('stopAt reached');
    return true;
  }

  /** Steps up to `maxTicks` times, or until stopped. Returns the number of steps taken. */
  run(maxTicks: number): number {
    let steps = 0;
    while (steps < maxTicks && this.step()) steps++;
    return steps;
  }

  /** Stops the simulation after the current step. Models call this to end a run. */
  stop(reason?: string): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#stopReason = reason;
    this.#notify('stopped');
  }

  /** Used by scapes to number agents in order of creation. */
  nextAgentId(): number {
    return this.#nextAgentId++;
  }

  #notify(event: keyof SimulationObserver): void {
    for (const observer of [...this.#observers]) observer[event]?.(this as unknown as Simulation);
  }
}

/** The model's own time at a tick, using its {@link TimeScale}; the tick itself when it has none. */
export function timeAt(sim: Simulation, tick: number): number {
  const scale = sim.model.time;
  if (!scale) return tick;
  const origin = scale.originOf ? scale.originOf(sim.parameters) : (scale.origin ?? 0);
  return origin + tick * (scale.step ?? 1);
}
