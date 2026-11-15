// SPDX-License-Identifier: EPL-2.0
import type { RootScape } from './root';
import type { ExecutionOrder, ExecutionStyle } from './rule';
import type { Scape } from './scape';

/*
 * Run-time settings, per scape: which rules are selected and in what order,
 * the execution order (by agent or by rule), the execution style (complete
 * tour or repeated draw) and the agents per iteration. They are plain data,
 * so a front end can keep them, store them as JSON, and apply them again to
 * every run of a model it creates.
 */

/** One rule of a scape. Rules are identified by name and by occurrence among rules of that name, counted in the order the model added them. */
export interface RuleSetting {
  readonly name: string;
  /** 0 for the first rule of this name the model added, 1 for the second, and so on. */
  readonly occurrence: number;
  /** Whether the rule is selected. */
  readonly enabled: boolean;
}

/** Everything about how one scape executes that can change while it runs. */
export interface ScapeSettings {
  /** The rules in the order they execute. */
  readonly rules: readonly RuleSetting[];
  readonly executionOrder: ExecutionOrder;
  readonly executionStyle: ExecutionStyle;
  /** Members acting per iteration, or `null` for all of them. */
  readonly agentsPerIteration: number | null;
}

/** Settings for several scapes, by scape name. */
export type ModelSettings = Readonly<Record<string, ScapeSettings>>;

const EXECUTION_ORDERS: readonly ExecutionOrder[] = ['byAgent', 'byRule'];
const EXECUTION_STYLES: readonly ExecutionStyle[] = ['completeTour', 'repeatedDraw'];

/** The key that identifies a rule within its scape: `name` or `name#2` for a second rule of that name. */
export function ruleKey(rule: Pick<RuleSetting, 'name' | 'occurrence'>): string {
  return rule.occurrence === 0 ? rule.name : `${rule.name}#${rule.occurrence}`;
}

/** The current settings of a scape. */
export function readScapeSettings(scape: Scape): ScapeSettings {
  const rules = scape.rules.map((entry): RuleSetting => ({
    name: entry.rule.name,
    occurrence: entry.occurrence,
    enabled: entry.enabled,
  }));
  return {
    rules,
    executionOrder: scape.executionOrder,
    executionStyle: scape.executionStyle,
    agentsPerIteration: scape.agentsPerIteration ?? null,
  };
}

/**
 * Applies settings to a scape. Rules are matched by name and occurrence; the
 * rules named are put in the given order, rules the settings do not mention
 * keep their relative order after them (and stay as enabled as they were), and
 * settings for rules the scape does not have are ignored. Safe between
 * iterations and during one: an iteration works from a snapshot of the rules
 * it began with.
 * Throws a `RangeError`, changing nothing, if a value is invalid.
 */
export function applyScapeSettings(scape: Scape, settings: ScapeSettings): void {
  if (!EXECUTION_ORDERS.includes(settings.executionOrder)) {
    throw new RangeError(`Unknown execution order "${String(settings.executionOrder)}"`);
  }
  if (!EXECUTION_STYLES.includes(settings.executionStyle)) {
    throw new RangeError(`Unknown execution style "${String(settings.executionStyle)}"`);
  }
  const { agentsPerIteration } = settings;
  if (
    agentsPerIteration !== null &&
    (!Number.isInteger(agentsPerIteration) || agentsPerIteration < 1)
  ) {
    throw new RangeError(
      `agentsPerIteration must be a positive integer or null, got ${agentsPerIteration}`,
    );
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

  scape.executionOrder = settings.executionOrder;
  scape.executionStyle = settings.executionStyle;
  scape.agentsPerIteration = agentsPerIteration ?? undefined;
}

/** The scapes of a model that have settings: those it was built from, and the root if it has rules. */
function settable(root: RootScape): readonly Scape[] {
  return root.rules.length > 0 ? [root, ...root.scapes] : root.scapes;
}

/** The current settings of every scape of a model. */
export function readModelSettings(root: RootScape): ModelSettings {
  const result: Record<string, ScapeSettings> = {};
  for (const scape of settable(root)) result[scape.name] = readScapeSettings(scape);
  return result;
}

/** Applies settings to the scapes of a model that they name; others are ignored. */
export function applyModelSettings(root: RootScape, settings: ModelSettings): void {
  for (const scape of settable(root)) {
    const wanted = settings[scape.name];
    if (wanted) applyScapeSettings(scape, wanted);
  }
}

/**
 * Remembers the settings a user has chosen and puts them on every root a
 * {@link Runner} creates, so they survive restarts until reset. Wire it up
 * with `onRoot: (root) => store.attach(root)`.
 */
export class SettingsStore {
  readonly #defaults = new WeakMap<RootScape, ModelSettings>();
  #chosen: Record<string, ScapeSettings> = {};

  /** What the user has changed, by scape name; empty when everything is at its defaults. */
  get chosen(): ModelSettings {
    return this.#chosen;
  }

  /** Whether anything differs from the model's defaults. */
  get customized(): boolean {
    return Object.keys(this.#chosen).length > 0;
  }

  /** Records the model's own settings as its defaults, then applies the chosen ones. */
  attach(root: RootScape): void {
    this.#defaults.set(root, readModelSettings(root));
    applyModelSettings(root, this.#chosen);
  }

  /** The settings a root had when it was attached; the current ones if it never was. */
  defaultsOf(root: RootScape): ModelSettings {
    return this.#defaults.get(root) ?? readModelSettings(root);
  }

  /** Applies settings to one scape of the model and remembers them for later runs. */
  set(root: RootScape, scapeName: string, settings: ScapeSettings): void {
    const scape = root.isRoot && root.name === scapeName ? root : root.findScape(scapeName);
    applyScapeSettings(scape, settings);
    this.#chosen = { ...this.#chosen, [scapeName]: settings };
  }

  /** Forgets everything chosen and puts the model back to its defaults. */
  reset(root: RootScape): void {
    this.#chosen = {};
    applyModelSettings(root, this.defaultsOf(root));
  }
}
