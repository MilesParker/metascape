// SPDX-License-Identifier: EPL-2.0
import type { Agent } from './agent';
import { resolveParameters, type ParameterSchema, type ParameterValues } from './parameters';
import { Random } from './random';
import type { Scape } from './scape';

/**
 * A model: its declared parameters and how to build its world.
 *
 * `build` adds scapes, rules and observers to a fresh simulation. It must not
 * keep state outside the simulation, so that every run starts clean.
 */
export interface Model<S extends ParameterSchema = ParameterSchema> {
  readonly name: string;
  readonly description?: string;
  readonly parameters: S;
  build(sim: Simulation<S>): void;
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
  readonly parameters: ParameterValues<S>;
  /** The root random stream. Scapes get their own streams forked from it. */
  readonly random: Random;
  readonly stopAt: number | undefined;

  readonly #scapes: Scape<Agent>[] = [];
  readonly #observers: SimulationObserver[] = [];
  #tick = 0;
  #nextAgentId = 0;
  #building = true;
  #stopped = false;
  #stopReason: string | undefined;

  constructor(model: Model<S>, options: SimulationOptions<S> = {}) {
    this.model = model;
    this.parameters = resolveParameters(model.parameters, options.parameters);
    // The only use of ambient entropy: choosing a seed when none is given.
    // eslint-disable-next-line no-restricted-properties
    this.seed = options.seed ?? Math.floor(Math.random() * 0x1_0000_0000);
    this.random = new Random(this.seed);
    this.stopAt = options.stopAt;

    model.build(this);
    this.#building = false;

    for (const scape of this.#scapes) scape.populate();
    for (const scape of this.#scapes) scape.initializeMembers();
    for (const scape of this.#scapes) scape.runInitialRules();
    this.#notify('initialized');
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
