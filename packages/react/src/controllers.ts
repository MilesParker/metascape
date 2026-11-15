// SPDX-License-Identifier: EPL-2.0
import {
  ParameterError,
  readScapeSettings,
  resolveParameters,
  ruleKey,
  type Agent,
  type Model,
  type Parameter,
  type ParameterSchema,
  type ParameterValues,
  type Runner,
  type Scape,
  type ScapeSettings,
  type SettingsStore,
  type RootScape,
} from '@metascape/engine';
import { useCallback, useMemo, useState } from 'react';
import { useRunnerState } from './hooks';

/*
 * Headless controllers: state and actions for parameter and rule editors,
 * with no markup, so any UI (the default player here, or a richer shell) can
 * draw them its own way.
 */

/** A parameter value as editors handle it. */
export type ParameterInput = number | string | boolean;
type Values = Readonly<Record<string, ParameterInput>>;

/** The engine's complaint about a value, or undefined when it is acceptable. */
export function validateParameter(
  schema: ParameterSchema,
  name: string,
  value: unknown,
): string | undefined {
  try {
    resolveParameters(schema, { [name]: value } as Partial<ParameterValues<ParameterSchema>>);
    return undefined;
  } catch (error) {
    if (error instanceof ParameterError) return error.message;
    throw error;
  }
}

/** The parameters of a schema by group, in declaration order; ungrouped ones under `undefined` first. */
export function groupParameters(
  schema: ParameterSchema,
): { group: string | undefined; names: string[] }[] {
  const groups: { group: string | undefined; names: string[] }[] = [];
  for (const [name, parameter] of Object.entries(schema)) {
    const group = parameter.group;
    let entry = groups.find((g) => g.group === group);
    if (!entry) {
      entry = { group, names: [] };
      if (group === undefined) groups.unshift(entry);
      else groups.push(entry);
    }
    entry.names.push(name);
  }
  return groups;
}

/**
 * Pairs of numeric parameters that bound one quantity, such as `minAge` and
 * `maxAge`, or `minimumVision` and `maximumVision`: the names of the low and
 * high ends and of the quantity.
 */
export function rangePairs(
  schema: ParameterSchema,
): { low: string; high: string; quantity: string }[] {
  const pairs: { low: string; high: string; quantity: string }[] = [];
  const names = Object.keys(schema);
  const numeric = (p: Parameter | undefined): boolean => p?.type === 'int' || p?.type === 'real';
  const used = new Set<string>();
  const forms: [RegExp, (stem: string) => string[]][] = [
    // minAge / maxAge, minimumVision / maximumVision
    [/^(min|minimum)([A-Z_].*)$/, (stem) => [`max${stem}`, `maximum${stem}`]],
    // ageMin / ageMax, valueMinimum / valueMaximum
    [/^(.+?)(Min|Minimum)$/, (stem) => [`${stem}Max`, `${stem}Maximum`]],
  ];
  for (const name of names) {
    if (used.has(name) || !numeric(schema[name])) continue;
    for (const [pattern, partners] of forms) {
      const match = pattern.exec(name);
      if (!match) continue;
      const stem = pattern.source.startsWith('^(min') ? match[2]! : match[1]!;
      const high = partners(stem).find((p) => numeric(schema[p]) && !used.has(p));
      if (high && schema[high]?.type === schema[name]?.type) {
        pairs.push({ low: name, high, quantity: stem.replace(/^_/, '') });
        used.add(name);
        used.add(high);
        break;
      }
    }
  }
  return pairs;
}

/** State and actions of a parameter editor, from {@link useParameterController}. */
export interface ParameterController {
  readonly schema: ParameterSchema;
  /** The values shown: those of the running model, with edits not yet applied. */
  readonly values: Values;
  readonly defaults: Values;
  /** Values the running model uses. */
  readonly applied: Values;
  /** Parameters edited but not yet applied: they need a restart. */
  readonly pending: readonly string[];
  /** Parameters whose shown value differs from the model's default. */
  readonly changed: readonly string[];
  /** Validation messages by parameter name. */
  readonly errors: Readonly<Record<string, string>>;
  readonly isLive: (name: string) => boolean;
  /**
   * Sets a value. A live parameter changes in the running model at once;
   * any other waits for {@link apply}. Invalid values are recorded in `errors`
   * and go no further. Returns whether the value took effect now.
   */
  readonly set: (name: string, value: ParameterInput) => boolean;
  /** Puts one parameter back to its default (live at once, others pending). */
  readonly reset: (name: string) => void;
  /** Puts every parameter back to its default. */
  readonly resetAll: () => void;
  /** Restarts with the pending values; returns an error message if that fails. */
  readonly apply: () => string | undefined;
  /** Forgets pending edits. */
  readonly discard: () => void;
}

/** Options of {@link useParameterController}. */
export interface ParameterControllerOptions {
  /** Called after a live parameter changes in the running model. */
  readonly onLiveChange?: (name: string, value: ParameterInput, root: RootScape) => void;
  /** Called after pending values are applied by a restart. */
  readonly onApply?: (values: Values) => void;
}

const differs = (a: unknown, b: unknown): boolean => a !== b;

/**
 * Edits a model's parameters against a runner: live parameters change the
 * running model immediately; the others collect as pending changes that
 * one restart applies.
 */
export function useParameterController<S extends ParameterSchema>(
  model: Model<S>,
  runner: Runner<S>,
  options: ParameterControllerOptions = {},
): ParameterController {
  const schema = model.parameters as ParameterSchema;
  const defaults = useMemo(() => resolveParameters(schema) as unknown as Values, [schema]);
  // What the running model uses: read afresh, so restarts from anywhere are seen.
  const { root } = useRunnerState(runner);
  const applied = root.parameters as unknown as Values;
  const [drafts, setDrafts] = useState<Values>({});
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const { onLiveChange, onApply } = options;

  const isLive = useCallback((name: string) => schema[name]?.live === true, [schema]);
  const values: Values = useMemo(() => ({ ...applied, ...drafts }), [applied, drafts]);
  const pending = Object.keys(drafts).filter((name) => differs(drafts[name], applied[name]));
  const changed = Object.keys(schema).filter((name) => differs(values[name], defaults[name]));

  const set = useCallback(
    (name: string, value: ParameterInput): boolean => {
      const message = validateParameter(schema, name, value);
      setErrors((previous) => {
        const next = { ...previous };
        if (message) next[name] = message;
        else delete next[name];
        return next;
      });
      if (message !== undefined) return false;
      if (isLive(name)) {
        try {
          runner.setParameter(name, value);
        } catch (error) {
          setErrors((previous) => ({ ...previous, [name]: String((error as Error).message) }));
          return false;
        }
        setDrafts((previous) => {
          if (!(name in previous)) return previous;
          const next = { ...previous };
          delete next[name];
          return next;
        });
        onLiveChange?.(name, value, runner.root as unknown as RootScape);
        return true;
      }
      setDrafts((previous) => {
        const next = { ...previous };
        if (applied[name] === value) delete next[name];
        else next[name] = value;
        return next;
      });
      return false;
    },
    [schema, isLive, runner, applied, onLiveChange],
  );

  const reset = useCallback(
    (name: string) => {
      const value = defaults[name];
      if (value !== undefined) set(name, value);
    },
    [defaults, set],
  );

  const resetAll = useCallback(() => {
    for (const name of Object.keys(schema)) {
      const value = defaults[name];
      if (value !== undefined && differs(values[name], value)) set(name, value);
    }
  }, [schema, defaults, values, set]);

  const apply = useCallback((): string | undefined => {
    try {
      runner.restart({ parameters: values as unknown as Partial<ParameterValues<S>> });
      setDrafts({});
      onApply?.(values);
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, [runner, values, onApply]);

  const discard = useCallback(() => {
    setDrafts({});
    setErrors({});
  }, []);

  return {
    schema,
    values,
    defaults,
    applied,
    pending,
    changed,
    errors,
    isLive,
    set,
    reset,
    resetAll,
    apply,
    discard,
  };
}

/** A scape that has rules, with its current settings. */
export interface ScapeRules {
  readonly scape: Scape<Agent>;
  readonly settings: ScapeSettings;
  /** Settings the model gave it, for showing what changed. */
  readonly defaults: ScapeSettings | undefined;
}

/** State and actions of a rule editor, from {@link useRulesController}. */
export interface RulesController {
  readonly scapes: readonly ScapeRules[];
  readonly customized: boolean;
  readonly error: string | undefined;
  /** Applies a change to one scape now and keeps it for restarts. */
  readonly change: (scape: string, patch: Partial<ScapeSettings>) => void;
  readonly toggle: (scape: string, ruleIndex: number, enabled: boolean) => void;
  /** Moves a rule from one position to another in its scape's order. */
  readonly move: (scape: string, from: number, to: number) => void;
  /** Puts every scape back to the model's settings. */
  readonly reset: () => void;
}

/**
 * Edits how a model's scapes execute: which rules are selected, their order, the
 * execution order and style, and the agents per iteration. Changes apply to the running model at once and
 * are kept by the store for restarts until reset. `frame` re-reads the scapes.
 */
export function useRulesController(
  root: RootScape,
  store: SettingsStore,
  frame?: number,
  onChange?: (scape: string, before: ScapeSettings, after: ScapeSettings) => void,
): RulesController {
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | undefined>(undefined);
  const defaults = store.defaultsOf(root);
  const scapes = useMemo(
    () =>
      root.scapes
        .filter((scape) => scape.rules.length > 0)
        .map((scape) => ({
          scape,
          settings: readScapeSettings(scape),
          defaults: defaults[scape.name],
        })),
    // `frame` and `version` mark changes to the live scapes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [root, defaults, frame, version],
  );

  const change = useCallback(
    (name: string, patch: Partial<ScapeSettings>) => {
      try {
        const scape = root.findScape(name);
        const before = readScapeSettings(scape);
        const after = { ...before, ...patch };
        store.set(root, name, after);
        setError(undefined);
        onChange?.(name, before, after);
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : String(problem));
      }
      setVersion((n) => n + 1);
    },
    [root, store, onChange],
  );

  const toggle = useCallback(
    (name: string, index: number, enabled: boolean) => {
      const current = readScapeSettings(root.findScape(name));
      change(name, {
        rules: current.rules.map((rule, i) => (i === index ? { ...rule, enabled } : rule)),
      });
    },
    [root, change],
  );

  const move = useCallback(
    (name: string, from: number, to: number) => {
      const rules = [...readScapeSettings(root.findScape(name)).rules];
      const [moved] = rules.splice(from, 1);
      if (!moved || from === to) return;
      rules.splice(Math.max(0, Math.min(rules.length, to)), 0, moved);
      change(name, { rules });
    },
    [root, change],
  );

  const reset = useCallback(() => {
    store.reset(root);
    setError(undefined);
    setVersion((n) => n + 1);
  }, [root, store]);

  return { scapes, customized: store.customized, error, change, toggle, move, reset };
}

/** The settings of a rule as a stable key, for lists and drag-and-drop. */
export { ruleKey };

/**
 * Plain words for a scape's execution settings, alongside their proper terms.
 * `randomOrder` says whether the scape's selected rules ask for a random tour.
 */
export function describeExecution(
  settings: ScapeSettings,
  size: number,
  randomOrder = true,
): {
  readonly who: string;
  readonly order: string;
  readonly schedule: string;
} {
  const count = settings.agentsPerIteration;
  const draw = settings.executionStyle === 'repeatedDraw';
  let who: string;
  if (count === null) {
    who = draw
      ? `${size} random draws, so some agents act more than once and others not at all`
      : 'every agent, once';
  } else {
    who = draw
      ? `${count} random draws (an agent may be drawn more than once)`
      : `${count} different agents chosen at random`;
  }
  const order = randomOrder
    ? 'in a fresh random order each period'
    : 'in the same order every period';
  const schedule =
    settings.executionOrder === 'byAgent'
      ? 'each agent runs all its rules before the next agent starts'
      : 'each rule runs for every agent before the next rule starts';
  return { who, order, schedule };
}

/** Whether any selected rule of a scape asks for its agents in a random order. */
export function needsRandomOrder(scape: Scape): boolean {
  return scape.rules.some((entry) => entry.enabled && entry.rule.randomExecution !== false);
}
