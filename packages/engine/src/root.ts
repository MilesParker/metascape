// SPDX-License-Identifier: EPL-2.0
import { enthrone, type Agent } from './agent';
import { DataGroup } from './data/data-group';
import type { StatCollector } from './data/stat-collector';
import {
  ParameterError,
  resolveParameters,
  type ParameterSchema,
  type ParameterValues,
} from './parameters';
import { Random } from './random';
import type { Rule } from './rule';
import {
  EXECUTE_RULES_RULE,
  INITIAL_RULES_RULE,
  INITIALIZE_RULE,
  POPULATE_RULE,
  propagate,
  Scape,
  type ScapeListener,
} from './scape';
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
 * What a model's periods are, such as years starting in AD 800. A period is
 * one iteration of the model; tools use this to label time.
 */
export interface PeriodScale<S extends ParameterSchema = ParameterSchema> {
  /** What one period is, singular, such as "year". */
  readonly name: string;
  /** Plural of `name`; default `name` + "s". */
  readonly plural?: string;
  /** The period the model starts at. Default 0; see also {@link PeriodScale.startOf}. */
  readonly start?: number;
  /** The start period when it depends on the parameters; takes precedence over `start`. */
  startOf?(parameters: ParameterValues<S>): number;
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
 * A model: its declared parameters and how its hierarchy of scapes is built.
 *
 * `build` is given the root scape and adds scapes to it, and to those scapes
 * their rules, statistics and views. It must not keep state outside the
 * hierarchy, so that every run starts clean.
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
  /** What the model's periods are. Default: periods counted from 0. */
  readonly period?: PeriodScale<S>;
  /** Small changes worth trying, each applied in one action. */
  readonly explorations?: readonly Exploration<S>[];
  /** Readable names for agent fields shown by inspectors; `null` hides a field. */
  readonly fields?: Readonly<Record<string, string | null>>;
  readonly parameters: S;
  /**
   * Ways to run the model that tools offer to choose from, such as the run
   * specs of an AMP model: parameter values, and when to stop.
   */
  readonly runs?: readonly RunSetup<S>[];
  /** Where a run stops when it is not told otherwise (see {@link RootOptions}). */
  readonly stopPeriod?: number;
  /** When a run stops when it is not told otherwise (see {@link RootOptions}). */
  readonly stopWhen?: readonly StopCondition<S>[];
  build(root: RootScape<S>): void;
  /**
   * Further views of a run, besides those `build` adds to scapes with
   * `addView`. Called once per run, after the model is initialized. Prefer
   * `addView` inside `build`, where the model's scapes are in scope.
   */
  views?(root: RootScape<S>): ViewSpec[];
}

/** Declares a model, inferring its parameter types from the schema. */
export function defineModel<const S extends ParameterSchema>(model: Model<S>): Model<S> {
  return model;
}

/**
 * A condition that ends a run: checked at the end of every period, once the
 * period's statistics are collected.
 */
export interface StopCondition<S extends ParameterSchema = ParameterSchema> {
  /** Why the run stopped, when it did because of this, such as "Foragers = 0". */
  readonly reason: string;
  holds(root: RootScape<S>): boolean;
}

/** A way to run a model: parameter values and when to stop. */
export interface RunSetup<S extends ParameterSchema = ParameterSchema> {
  readonly name: string;
  /** Values for the model's parameters, in place of their defaults. */
  readonly parameters?: Partial<ParameterValues<S>>;
  readonly stopPeriod?: number;
  readonly stopWhen?: readonly StopCondition<S>[];
}

export interface RootOptions<S extends ParameterSchema> {
  /** Determines every random choice in the run. Default: a fresh seed, kept in `root.seed`. */
  readonly seed?: number | string;
  /** Values for the model's parameters, in place of their defaults. */
  readonly parameters?: Partial<ParameterValues<S>>;
  /** Stop automatically once this period has been reached. Default: the model's. */
  readonly stopPeriod?: number;
  /** Stop at the end of the first period in which one of these holds. Default: the model's. */
  readonly stopWhen?: readonly StopCondition<S>[];
  /** Keep every period's statistics (default) or only the latest. */
  readonly history?: boolean;
}

/** Collects every scape's statistics: its members', then the scapes in it, then its calculated values. */
function collectStatsRule(data: DataGroup): Rule<Agent> {
  const rule: Rule<Agent> = {
    name: 'Collect Statistics',
    randomExecution: false,
    causesRemoval: false,
    execute(agent) {
      if (!(agent instanceof Scape)) return;
      const scape = agent as Scape;
      data.collectMembers(scape);
      for (const member of [...scape.memberScapes]) rule.execute(member);
      data.calculate(scape);
    },
  };
  return rule;
}

const NOTIFY_RULES: { readonly [K in keyof ScapeListener]-?: Rule<Agent> } = {
  scapeInitialized: propagate('Notify Initialized', (scape) =>
    scape.notifyListeners('scapeInitialized'),
  ),
  scapeIterated: propagate('Notify Iterated', (scape) => scape.notifyListeners('scapeIterated')),
  scapeStopped: propagate('Notify Stopped', (scape) => scape.notifyListeners('scapeStopped')),
};

/**
 * The root of a model: the scape that contains every other, and one run of
 * the model, fully determined by the model, its parameters and the seed.
 *
 * It is a scape like any other, with what only the outermost scape can hold:
 * the model's parameters, the period counter and the random stream every
 * other scape's stream is forked from. Its members are the scapes the model
 * adds to it.
 *
 * Construction builds the hierarchy, creates and initializes its agents and
 * collects the first statistics, leaving the model at its start period. Each
 * {@link iterate} advances one period: the root executes its rules across
 * its members and each scape in turn does the same, in the order the scapes
 * were added, then statistics are collected and listeners told, by the same
 * mechanism. To run a model again, create a new root.
 */
export class RootScape<S extends ParameterSchema = ParameterSchema> extends Scape<Agent> {
  readonly model: Model<S>;
  readonly seed: number | string;
  /** The period the model starts at. */
  readonly startPeriod: number;
  readonly stopPeriod: number | undefined;
  readonly stopWhen: readonly StopCondition<S>[];
  /** The model's data: a series for everything its scapes collect. */
  readonly data: DataGroup;

  readonly #scapes: Scape[] = [];
  readonly #declaredViews: ViewSpec[] = [];
  readonly #collectStats: Rule<Agent>;
  #views: readonly ViewSpec[] | undefined;
  #parameters: ParameterValues<S>;
  #iteration = 0;
  #nextAgentId = 0;
  #nextScapeId = 1;
  #building = true;
  #busy = true;
  #stopped = false;
  #stopAnnounced = false;
  #stopReason: string | undefined;

  constructor(model: Model<S>, options: RootOptions<S> = {}) {
    super({ name: model.name });
    this.model = model;
    this.#parameters = resolveParameters(model.parameters, options.parameters);
    // The only use of ambient entropy: choosing a seed when none is given.
    // eslint-disable-next-line no-restricted-properties
    this.seed = options.seed ?? Math.floor(Math.random() * 0x1_0000_0000);
    this.stopPeriod = options.stopPeriod ?? model.stopPeriod;
    this.stopWhen = options.stopWhen ?? model.stopWhen ?? [];
    const scale = model.period;
    this.startPeriod = scale?.startOf ? scale.startOf(this.#parameters) : (scale?.start ?? 0);
    this.data = new DataGroup(options.history === undefined ? {} : { history: options.history });
    this.#collectStats = collectStatsRule(this.data);
    enthrone(this);
    this.enroot(this as unknown as RootScape, new Random(this.seed));

    model.build(this);
    this.#building = false;

    this.execute(POPULATE_RULE);
    this.initialize();
    this.execute(INITIALIZE_RULE);
    this.execute(INITIAL_RULES_RULE);
    this.#collect();
    this.execute(NOTIFY_RULES.scapeInitialized);
    this.#busy = false;
    this.#announceStop();
  }

  /**
   * The model's parameter values. They are properties of the model that can
   * be read at any time; read them as the run goes to see changes.
   */
  get parameters(): ParameterValues<S> {
    return this.#parameters;
  }

  /**
   * Sets a parameter. The model sees the new value wherever it reads
   * `root.parameters` from now on; whether that changes anything is up to
   * the model, and a parameter declared `live` is one it reads as it runs.
   * Throws a `ParameterError`, changing nothing, for an unknown parameter or
   * a value that does not fit.
   */
  setParameter(name: string, value: number | string | boolean): void {
    const parameter = (this.model.parameters as ParameterSchema)[name];
    if (!parameter) throw new ParameterError(`Unknown parameter "${name}"`);
    this.#parameters = resolveParameters(this.model.parameters, {
      ...this.#parameters,
      [name]: value,
    } as Partial<ParameterValues<S>>);
  }

  /** The current period: the start period plus the iterations executed. */
  override get period(): number {
    return this.startPeriod + this.#iteration;
  }

  /** The number of iterations executed so far. */
  override get iteration(): number {
    return this.#iteration;
  }

  get stopped(): boolean {
    return this.#stopped;
  }

  /** Why the model stopped, if a reason was given. */
  get stopReason(): string | undefined {
    return this.#stopReason;
  }

  /**
   * The scapes the model was built from, each before the scapes in it and in
   * the order they were added, which is the order they iterate in. The root
   * itself is not among them.
   */
  get scapes(): readonly Scape[] {
    return this.#scapes;
  }

  /** The views of the model: those added to its scapes, in the order added, then any from `model.views`. */
  get allViews(): readonly ViewSpec[] {
    this.#views ??= [...this.#declaredViews, ...(this.model.views?.(this) ?? [])];
    return this.#views;
  }

  /**
   * Advances one period: every scape executes its rules across its members,
   * then statistics are collected and listeners told. Returns false, doing
   * nothing, if the model has stopped.
   */
  iterate(): boolean {
    if (this.#stopped) return false;
    this.#iteration++;
    this.#busy = true;
    try {
      this.execute(EXECUTE_RULES_RULE);
      this.#collect();
      this.execute(NOTIFY_RULES.scapeIterated);
      const condition = this.stopWhen.find((c) => c.holds(this));
      if (condition) this.stop(condition.reason);
      else if (this.stopPeriod !== undefined && this.period >= this.stopPeriod) {
        this.stop('stopPeriod reached');
      }
    } finally {
      this.#busy = false;
    }
    this.#announceStop();
    return true;
  }

  /** Iterates up to `maxIterations` times, or until stopped. Returns the number of iterations executed. */
  run(maxIterations: number): number {
    let iterations = 0;
    while (iterations < maxIterations && this.iterate()) iterations++;
    return iterations;
  }

  /**
   * Stops the model once the current iteration is complete. Rules call this
   * to end a run.
   */
  stop(reason?: string): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#stopReason = reason;
    if (!this.#busy) this.#announceStop();
  }

  /** Engine-internal: numbers agents in order of joining. */
  nextAgentId(): number {
    return this.#nextAgentId++;
  }

  /** Engine-internal: numbers scapes in order of joining. */
  nextScapeId(): number {
    return this.#nextScapeId++;
  }

  /** Engine-internal: checks that a scape may join the hierarchy under `parent`. */
  admit(scape: Scape, parent: Scape): void {
    if (!this.#building) {
      if (parent === (this as unknown as Scape)) {
        throw new Error('Scapes can only be added to the root while the model is built');
      }
      return;
    }
    if (this.#scapes.some((existing) => existing.name === scape.name)) {
      throw new Error(`A scape named "${scape.name}" already exists`);
    }
  }

  /** Engine-internal: records a scape the model is built from. */
  registerScape(scape: Scape): void {
    if (this.#building) this.#scapes.push(scape);
  }

  /** Engine-internal: gives a stat collector its series in the model's data. */
  registerStatCollector(scape: Scape, collector: StatCollector): void {
    this.data.register(scape, collector);
  }

  /** Engine-internal: records a view added to a scape of the model. */
  registerView(view: ViewSpec): void {
    if (!this.#building) throw new Error('Views can only be added while the model is built');
    this.#declaredViews.push(view);
  }

  #collect(): void {
    this.data.begin(this.period);
    this.execute(this.#collectStats);
  }

  #announceStop(): void {
    if (!this.#stopped || this.#stopAnnounced) return;
    this.#stopAnnounced = true;
    this.execute(NOTIFY_RULES.scapeStopped);
  }
}
