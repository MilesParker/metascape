// SPDX-License-Identifier: EPL-2.0
import type { Agent } from './agent';
import type { Sampling, Scape, Schedule, VisitOrder } from './scape';
import type { Simulation } from './simulation';

/*
 * Run-time settings: which rules run, in what order, and how a scape visits
 * its members. They are plain data, so a front end can keep them, store them
 * as JSON, and apply them again to every simulation it creates.
 */

/** One rule of a scape. Rules are identified by name and by occurrence among rules of that name, counted in the order the model added them. */
export interface RuleSetting {
  readonly name: string;
  /** 0 for the first rule of this name the model added, 1 for the second, and so on. */
  readonly occurrence: number;
  readonly enabled: boolean;
}

/** Everything about how one scape runs that can change while it runs. */
export interface ScapeSettings {
  /** The rules in the order they execute. */
  readonly rules: readonly RuleSetting[];
  readonly schedule: Schedule;
  readonly order: VisitOrder;
  /** Members acting per step, or `null` for all of them. */
  readonly activations: number | null;
  readonly sampling: Sampling;
}

/** Settings for several scapes, by scape name. */
export type SimulationSettings = Readonly<Record<string, ScapeSettings>>;

const SCHEDULES: readonly Schedule[] = ['byAgent', 'byRule'];
const ORDERS: readonly VisitOrder[] = ['shuffled', 'sequential'];
const SAMPLINGS: readonly Sampling[] = ['tour', 'draw'];

/** The key that identifies a rule within its scape: `name` or `name#2` for a second rule of that name. */
export function ruleKey(rule: Pick<RuleSetting, 'name' | 'occurrence'>): string {
  return rule.occurrence === 0 ? rule.name : `${rule.name}#${rule.occurrence}`;
}

/** The current settings of a scape. */
export function readScapeSettings(scape: Scape<Agent>): ScapeSettings {
  const rules = scape.rules.map((entry): RuleSetting => ({
    name: entry.rule.name,
    occurrence: entry.occurrence,
    enabled: entry.enabled,
  }));
  return {
    rules,
    schedule: scape.schedule,
    order: scape.order,
    activations: scape.activations ?? null,
    sampling: scape.sampling,
  };
}

/**
 * Applies settings to a scape. Rules are matched by name and occurrence; the
 * rules named are put in the given order, rules the settings do not mention
 * keep their relative order after them (and stay as enabled as they were), and
 * settings for rules the scape does not have are ignored. Safe between steps
 * and during one: a step works from a snapshot of the rules it began with.
 * Throws a `RangeError`, changing nothing, if a value is invalid.
 */
export function applyScapeSettings(scape: Scape<Agent>, settings: ScapeSettings): void {
  if (!SCHEDULES.includes(settings.schedule)) {
    throw new RangeError(`Unknown schedule "${String(settings.schedule)}"`);
  }
  if (!ORDERS.includes(settings.order)) {
    throw new RangeError(`Unknown visit order "${String(settings.order)}"`);
  }
  if (!SAMPLINGS.includes(settings.sampling)) {
    throw new RangeError(`Unknown sampling "${String(settings.sampling)}"`);
  }
  const { activations } = settings;
  if (activations !== null && (!Number.isInteger(activations) || activations < 1)) {
    throw new RangeError(`activations must be a positive integer or null, got ${activations}`);
  }

  const byKey = new Map<string, (typeof scape.rules)[number]>();
  for (const entry of scape.rules) {
    byKey.set(ruleKey({ name: entry.rule.name, occurrence: entry.occurrence }), entry);
  }
  const ordered: (typeof scape.rules)[number][] = [];
  const used = new Set<(typeof scape.rules)[number]>();
  for (const setting of settings.rules) {
    const entry = byKey.get(ruleKey(setting));
    if (!entry || used.has(entry)) continue;
    entry.enabled = setting.enabled;
    ordered.push(entry);
    used.add(entry);
  }
  for (const entry of scape.rules) if (!used.has(entry)) ordered.push(entry);
  scape.rules.splice(0, scape.rules.length, ...ordered);

  scape.schedule = settings.schedule;
  scape.order = settings.order;
  scape.activations = activations ?? undefined;
  scape.sampling = settings.sampling;
}

/** The current settings of every scape of a simulation that has rules. */
export function readSimulationSettings(sim: Simulation): SimulationSettings {
  const result: Record<string, ScapeSettings> = {};
  for (const scape of sim.scapes) result[scape.name] = readScapeSettings(scape);
  return result;
}

/** Applies settings to the scapes of a simulation that they name; others are ignored. */
export function applySimulationSettings(sim: Simulation, settings: SimulationSettings): void {
  for (const scape of sim.scapes) {
    const wanted = settings[scape.name];
    if (wanted) applyScapeSettings(scape, wanted);
  }
}

/**
 * Remembers the settings a user has chosen and puts them on every simulation
 * of a run, so they survive restarts until reset. Wire it to a
 * {@link Runner} with `onSimulation: (sim) => store.attach(sim)`.
 */
export class SettingsStore {
  readonly #defaults = new WeakMap<Simulation, SimulationSettings>();
  #chosen: Record<string, ScapeSettings> = {};

  /** What the user has changed, by scape name; empty when everything is at its defaults. */
  get chosen(): SimulationSettings {
    return this.#chosen;
  }

  /** Whether anything differs from the model's defaults. */
  get customized(): boolean {
    return Object.keys(this.#chosen).length > 0;
  }

  /** Records the simulation's own settings as its defaults, then applies the chosen ones. */
  attach(sim: Simulation): void {
    this.#defaults.set(sim, readSimulationSettings(sim));
    applySimulationSettings(sim, this.#chosen);
  }

  /** The settings a simulation had when it was attached; the current ones if it never was. */
  defaultsOf(sim: Simulation): SimulationSettings {
    return this.#defaults.get(sim) ?? readSimulationSettings(sim);
  }

  /** Applies settings to one scape of the simulation and remembers them for later runs. */
  set(sim: Simulation, scapeName: string, settings: ScapeSettings): void {
    applyScapeSettings(sim.scape(scapeName), settings);
    this.#chosen = { ...this.#chosen, [scapeName]: settings };
  }

  /** Forgets everything chosen and puts the simulation back to its defaults. */
  reset(sim: Simulation): void {
    this.#chosen = {};
    applySimulationSettings(sim, this.defaultsOf(sim));
  }
}
