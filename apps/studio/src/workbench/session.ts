// SPDX-License-Identifier: EPL-2.0
import {
  readScapeSettings,
  resolveParameters,
  SettingsStore,
  type Model,
  type ParameterSchema,
  type Runner,
  type ScapeSettings,
  type RootScape,
  type RunSetup,
} from '@metascape/engine';
import {
  describeTime,
  ghostOf,
  humanize,
  NO_CUSTOMIZATIONS,
  useParameterController,
  useRunner,
  useRunnerState,
  useRulesController,
  validateParameter,
  type ChartCustomizations,
  type ParameterController,
  type RulesController,
  type RunnerSnapshot,
} from '@metascape/react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ManifestModel } from '../catalog';
import { readLocal, writeLocal } from '../lib/storage';
import { compact, decodeRules, encodeRules, type WorkbenchSearch } from '../lib/url-state';
import { useWorkbench } from './store';

/** Everything the Workbench's panels share about the running model. */
export interface Session {
  readonly entry: ManifestModel;
  readonly model: Model;
  readonly runner: Runner;
  readonly snapshot: RunnerSnapshot;
  readonly root: RootScape;
  readonly frame: number;
  readonly settings: SettingsStore;
  readonly parameters: ParameterController;
  readonly rules: RulesController;
  readonly charts: ChartCustomizations;
  readonly setCharts: (next: ChartCustomizations) => void;
  /** Presenting: the chrome hidden, for a projector. */
  readonly present: boolean;
  readonly setPresent: (present: boolean) => void;
  /** Same seed, same settings: the run again. */
  readonly restart: () => void;
  /** A fresh random seed. */
  readonly reseed: (seed?: number | string) => void;
  /** Applies pending parameter edits by restarting. */
  readonly apply: () => string | undefined;
  /** Restarts with these parameter values (and any pending ones). */
  readonly restartWith: (values: Readonly<Record<string, number | string | boolean>>) => void;
  /** The model's runs, from its run specs, to choose from. */
  readonly runs: readonly RunSetup[];
  /** The name of the run last chosen; undefined for the model's defaults. */
  readonly run: string | undefined;
  /** Restarts as a run says: its parameter values over the defaults, and when it stops. */
  readonly chooseRun: (name: string | undefined) => void;
}

const randomSeed = (): number => Math.floor(Math.random() * 1_000_000);

/** When a run stops, as a run of the model says, or as the model does without one. */
const stopsFor = (setup: RunSetup | undefined) => ({
  stopPeriod: setup?.stopPeriod ?? null,
  stopWhen: setup?.stopWhen ?? null,
});

/** Parameter values from the address that the model accepts; others are dropped. */
function acceptedParameters(
  schema: ParameterSchema,
  given: WorkbenchSearch['p'],
): Record<string, number | string | boolean> {
  const accepted: Record<string, number | string | boolean> = {};
  for (const [name, value] of Object.entries(given ?? {})) {
    if (schema[name] && validateParameter(schema, name, value) === undefined) {
      accepted[name] = value;
    }
  }
  return accepted;
}

function applyRules(
  store: SettingsStore,
  root: RootScape,
  settings: Record<string, ScapeSettings>,
): void {
  for (const [scape, wanted] of Object.entries(settings)) {
    try {
      store.set(root, scape, wanted);
    } catch {
      // A scape that this model does not have, or settings that no longer fit.
    }
  }
}

/** A rule change in words, for the marks on the charts: "Movement off", "Harvest to 1". */
export function describeRuleChange(
  scape: string,
  before: ScapeSettings,
  after: ScapeSettings,
): string {
  for (const rule of after.rules) {
    const old = before.rules.find((r) => r.name === rule.name && r.occurrence === rule.occurrence);
    if (old && old.enabled !== rule.enabled) return `${rule.name} ${rule.enabled ? 'on' : 'off'}`;
  }
  const at = (s: ScapeSettings, rule: { name: string; occurrence: number }): number =>
    s.rules.findIndex((r) => r.name === rule.name && r.occurrence === rule.occurrence);
  // The rule that travelled furthest is the one that was dragged.
  let moved: { name: string; to: number; distance: number } | undefined;
  for (const rule of after.rules) {
    const distance = Math.abs(at(before, rule) - at(after, rule));
    if (distance > 0 && (!moved || distance > moved.distance)) {
      moved = { name: rule.name, to: at(after, rule) + 1, distance };
    }
  }
  if (moved) return `${moved.name} to ${moved.to}`;
  if (before.executionOrder !== after.executionOrder)
    return `${scape}: ${after.executionOrder === 'byRule' ? 'by rule' : 'by agent'}`;
  if (before.executionStyle !== after.executionStyle) {
    return `${scape}: ${after.executionStyle === 'completeTour' ? 'complete tour' : 'repeated draw'}`;
  }
  if (before.agentsPerIteration !== after.agentsPerIteration) {
    const count = after.agentsPerIteration === null ? 'all' : after.agentsPerIteration;
    return `${scape}: ${count} per iteration`;
  }
  return scape;
}

/**
 * Runs one model for the Workbench: the runner and its settings, parameter
 * and rule editing, chart choices, and the address, which always holds what
 * reproduces the run (seed, parameters, rules, charts, presenting). Back and
 * forward restore earlier states.
 */
export function useSession(entry: ManifestModel, model: Model): Session {
  const search = useSearch({ from: '/models/$modelId' });
  const navigate = useNavigate({ from: '/models/$modelId' });
  const schema = model.parameters;
  const workbench = useWorkbench;
  const runs = useMemo(() => model.runs ?? [], [model]);
  const setupOf = useCallback(
    (name: string | undefined) => runs.find((setup) => setup.name === name),
    [runs],
  );
  /** A run's parameter values, then those of the address, over the defaults. */
  const valuesFor = useCallback(
    (setup: RunSetup | undefined, p?: WorkbenchSearch['p']) => ({
      ...(resolveParameters(schema) as Record<string, number | string | boolean>),
      ...(setup?.parameters as Record<string, number | string | boolean> | undefined),
      ...acceptedParameters(schema, p),
    }),
    [schema],
  );

  const [settings] = useState(() => new SettingsStore());
  const [initial] = useState(() => {
    const setup = setupOf(search.run);
    return {
      seed: search.seed ?? randomSeed(),
      parameters: {
        ...(setup?.parameters as Record<string, number | string | boolean> | undefined),
        ...acceptedParameters(schema, search.p),
      },
      ...(setup?.stopPeriod !== undefined && { stopPeriod: setup.stopPeriod }),
      ...(setup?.stopWhen !== undefined && { stopWhen: setup.stopWhen }),
      rules: decodeRules(search.r),
    };
  });
  // The run chosen is in the address, which always reproduces the current run.
  const run = setupOf(search.run)?.name;
  const runnerRef = useRef<Runner | undefined>(undefined);
  const firstRules = useRef<Record<string, ScapeSettings> | undefined>(initial.rules);

  const runner = useRunner(model, {
    seed: initial.seed,
    parameters: initial.parameters,
    ...(initial.stopPeriod !== undefined && { stopPeriod: initial.stopPeriod }),
    ...(initial.stopWhen !== undefined && { stopWhen: initial.stopWhen }),
    onRoot: (created) => {
      const previous = runnerRef.current?.root;
      settings.attach(created);
      if (firstRules.current) {
        applyRules(settings, created, firstRules.current);
        firstRules.current = undefined;
      }
      // The run being replaced becomes the ghost in the charts.
      if (previous && previous !== created) {
        workbench.getState().newRun(previous.iteration > 0 ? ghostOf(previous) : undefined);
      }
    },
  }) as unknown as Runner;
  useEffect(() => {
    runnerRef.current = runner;
  }, [runner]);
  const snapshot = useRunnerState(runner);
  const { root, frame } = snapshot;

  // What this session last wrote to the address, to tell its own changes from back and forward.
  const written = useRef<string | undefined>(undefined);
  const key = (s: WorkbenchSearch): string =>
    JSON.stringify([s.seed ?? null, s.run ?? null, s.p ?? {}, s.r ?? {}]);

  const [charts, setChartsState] = useState<ChartCustomizations>(
    () => search.c ?? readLocal(`charts:${entry.id}`, NO_CUSTOMIZATIONS),
  );
  const present = search.view === 'present';

  /** The address that reproduces the current run. */
  const currentSearch = useCallback(
    (extra: Partial<WorkbenchSearch> = {}): WorkbenchSearch => {
      const defaults = resolveParameters(schema) as Record<string, unknown>;
      const live = runner.root.parameters as Record<string, number | string | boolean>;
      const p = Object.fromEntries(Object.entries(live).filter(([n, v]) => defaults[n] !== v));
      const c = extra.c ?? charts;
      return compact({
        seed: runner.root.seed,
        run: 'run' in extra ? extra.run : run,
        p: Object.keys(p).length > 0 ? p : undefined,
        r: encodeRules(settings.chosen),
        c: c.added.length > 0 || Object.keys(c.changed).length > 0 ? c : undefined,
        view: 'view' in extra ? extra.view : search.view,
      });
    },
    [schema, runner, settings, charts, search.view, run],
  );

  const write = useCallback(
    (replace: boolean, extra: Partial<WorkbenchSearch> = {}) => {
      const next = currentSearch(extra);
      written.current = key(next);
      void navigate({ search: next, replace });
    },
    [currentSearch, navigate],
  );

  // Put the seed in the address straight away, so a reload shows the same run.
  useEffect(() => {
    if (search.seed === undefined) write(true);
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back and forward: restore the run the address describes.
  useEffect(() => {
    const wanted = key(search);
    if (written.current === undefined) {
      written.current = wanted;
      return;
    }
    if (wanted === written.current) return;
    written.current = wanted;
    const setup = setupOf(search.run);
    settings.reset(runner.root);
    firstRules.current = decodeRules(search.r);
    try {
      runner.restart({
        seed: search.seed ?? runner.root.seed,
        parameters: valuesFor(setup, search.p),
        ...stopsFor(setup),
      });
    } catch {
      // Leave the current run; the address was not usable.
    }
  }, [search, runner, settings, setupOf, valuesFor]);

  const parameters = useParameterController(model, runner, {
    onLiveChange: (name, value, current) => {
      workbench.getState().addIntervention({
        period: current.period,
        kind: 'parameter',
        key: name,
        label: `${schema[name]?.label ?? humanize(name)} → ${String(value)}`,
      });
      write(true);
    },
    onApply: () => write(false),
  });

  const rules = useRulesController(root, settings, frame, (scape, before, after) => {
    workbench.getState().addIntervention({
      period: runner.root.period,
      kind: 'rule',
      label: describeRuleChange(scape, before, after),
    });
    write(false);
  });
  const resetRules = rules.reset;
  const rulesWithUrl = useMemo(
    () => ({
      ...rules,
      reset: () => {
        resetRules();
        write(false);
      },
    }),
    [rules, resetRules, write],
  );

  const setCharts = useCallback(
    (next: ChartCustomizations) => {
      setChartsState(next);
      writeLocal(`charts:${entry.id}`, next);
      write(true, { c: next });
    },
    [entry.id, write],
  );

  const setPresent = useCallback(
    (next: boolean) => write(true, { view: next ? 'present' : undefined }),
    [write],
  );

  const restart = useCallback(() => {
    runner.restart();
    write(true);
  }, [runner, write]);

  const reseed = useCallback(
    (seed?: number | string) => {
      runner.restart({ seed: seed ?? randomSeed() });
      write(false);
    },
    [runner, write],
  );

  const apply = parameters.apply;

  const restartWith = useCallback(
    (values: Readonly<Record<string, number | string | boolean>>) => {
      try {
        runner.restart({ parameters: { ...parameters.values, ...values } });
        parameters.discard();
        write(false);
      } catch {
        // Values the model refuses leave the run as it was.
      }
    },
    [runner, parameters, write],
  );

  const chooseRun = useCallback(
    (name: string | undefined) => {
      const setup = setupOf(name);
      try {
        runner.restart({ parameters: valuesFor(setup), ...stopsFor(setup) });
      } catch {
        // A run the model refuses leaves the run as it was.
        return;
      }
      parameters.discard();
      write(false, { run: setup?.name });
    },
    [runner, parameters, setupOf, valuesFor, write],
  );

  // Keep the selection only while its model runs.
  useEffect(() => {
    const selection = workbench.getState().selection;
    if (selection && selection.root !== root) workbench.getState().select(undefined);
  }, [root, workbench]);

  return {
    entry,
    model,
    runner,
    snapshot,
    root,
    frame,
    settings,
    parameters,
    rules: rulesWithUrl,
    charts,
    setCharts,
    present,
    setPresent,
    restart,
    reseed,
    apply,
    restartWith,
    runs,
    run,
    chooseRun,
  };
}

/** The current period in words, such as "year 1043". */
export const nowText = (root: RootScape): string => describeTime(root, root.period);

export { readScapeSettings };
