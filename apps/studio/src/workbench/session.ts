// SPDX-License-Identifier: EPL-2.0
import {
  readScapeSettings,
  resolveParameters,
  SettingsStore,
  type Model,
  type ParameterSchema,
  type Runner,
  type ScapeSettings,
  type Simulation,
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
  readonly sim: Simulation;
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
}

const randomSeed = (): number => Math.floor(Math.random() * 1_000_000);

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
  sim: Simulation,
  settings: Record<string, ScapeSettings>,
): void {
  for (const [scape, wanted] of Object.entries(settings)) {
    try {
      store.set(sim, scape, wanted);
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
  if (before.schedule !== after.schedule)
    return `${scape}: ${after.schedule === 'byRule' ? 'by rule' : 'by agent'}`;
  if (before.order !== after.order)
    return `${scape}: ${after.order === 'shuffled' ? 'shuffled' : 'sequential'}`;
  if (before.sampling !== after.sampling)
    return `${scape}: ${after.sampling === 'tour' ? 'complete tour' : 'repeated draw'}`;
  if (before.activations !== after.activations)
    return `${scape}: ${after.activations === null ? 'all' : after.activations} per step`;
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

  const [settings] = useState(() => new SettingsStore());
  const [initial] = useState(() => ({
    seed: search.seed ?? randomSeed(),
    parameters: acceptedParameters(schema, search.p),
    rules: decodeRules(search.r),
  }));
  const runnerRef = useRef<Runner | undefined>(undefined);
  const firstRules = useRef<Record<string, ScapeSettings> | undefined>(initial.rules);

  const runner = useRunner(model, {
    seed: initial.seed,
    parameters: initial.parameters,
    onSimulation: (created) => {
      const previous = runnerRef.current?.sim;
      settings.attach(created);
      if (firstRules.current) {
        applyRules(settings, created, firstRules.current);
        firstRules.current = undefined;
      }
      // The run being replaced becomes the ghost in the charts.
      if (previous && previous !== created) {
        workbench.getState().newRun(previous.tick > 0 ? ghostOf(previous) : undefined);
      }
    },
  }) as unknown as Runner;
  useEffect(() => {
    runnerRef.current = runner;
  }, [runner]);
  const snapshot = useRunnerState(runner);
  const { sim, frame } = snapshot;

  // What this session last wrote to the address, to tell its own changes from back and forward.
  const written = useRef<string | undefined>(undefined);
  const key = (s: WorkbenchSearch): string =>
    JSON.stringify([s.seed ?? null, s.p ?? {}, s.r ?? {}]);

  const [charts, setChartsState] = useState<ChartCustomizations>(
    () => search.c ?? readLocal(`charts:${entry.id}`, NO_CUSTOMIZATIONS),
  );
  const present = search.view === 'present';

  /** The address that reproduces the current run. */
  const currentSearch = useCallback(
    (extra: Partial<WorkbenchSearch> = {}): WorkbenchSearch => {
      const defaults = resolveParameters(schema) as Record<string, unknown>;
      const live = runner.sim.parameters as Record<string, number | string | boolean>;
      const p = Object.fromEntries(Object.entries(live).filter(([n, v]) => defaults[n] !== v));
      const c = extra.c ?? charts;
      return compact({
        seed: runner.sim.seed,
        p: Object.keys(p).length > 0 ? p : undefined,
        r: encodeRules(settings.chosen),
        c: c.added.length > 0 || Object.keys(c.changed).length > 0 ? c : undefined,
        view: 'view' in extra ? extra.view : search.view,
      });
    },
    [schema, runner, settings, charts, search.view],
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
    const parameters = {
      ...(resolveParameters(schema) as Record<string, number | string | boolean>),
      ...acceptedParameters(schema, search.p),
    };
    settings.reset(runner.sim);
    firstRules.current = decodeRules(search.r);
    try {
      runner.restart({ seed: search.seed ?? runner.sim.seed, parameters });
    } catch {
      // Leave the current run; the address was not usable.
    }
  }, [search, schema, runner, settings]);

  const parameters = useParameterController(model, runner, {
    onLiveChange: (name, value, current) => {
      workbench.getState().addIntervention({
        tick: current.tick,
        kind: 'parameter',
        key: name,
        label: `${schema[name]?.label ?? humanize(name)} → ${String(value)}`,
      });
      write(true);
    },
    onApply: () => write(false),
  });

  const rules = useRulesController(sim, settings, frame, (scape, before, after) => {
    workbench.getState().addIntervention({
      tick: runner.sim.tick,
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

  // Keep the selection only while its simulation runs.
  useEffect(() => {
    const selection = workbench.getState().selection;
    if (selection && selection.sim !== sim) workbench.getState().select(undefined);
  }, [sim, workbench]);

  return {
    entry,
    model,
    runner,
    snapshot,
    sim,
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
  };
}

/** The time of the current tick in words, such as "year 1043". */
export const nowText = (sim: Simulation): string => describeTime(sim, sim.tick);

export { readScapeSettings };
