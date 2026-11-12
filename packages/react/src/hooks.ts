// SPDX-License-Identifier: EPL-2.0
import {
  Runner,
  type Model,
  type ParameterSchema,
  type RunnerOptions,
  type RunnerState,
  type Simulation,
} from '@metascape/engine';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

/** What {@link useRunnerState} reports about a runner at one moment. */
export interface RunnerSnapshot<S extends ParameterSchema = ParameterSchema> {
  readonly state: RunnerState;
  /** The tick of the current simulation. */
  readonly tick: number;
  /** The current simulation; a new object after every restart. */
  readonly sim: Simulation<S>;
  /** The exception that stopped the runner, if any. */
  readonly error: unknown;
  /** Counts frames, restarts and state changes; changes whenever anything may have changed. */
  readonly frame: number;
}

interface Store {
  frame: number;
  dirty: boolean;
  snapshot: RunnerSnapshot | undefined;
}

const stores = new WeakMap<Runner<never>, Store>();

function storeFor(runner: Runner<never>): Store {
  let store = stores.get(runner);
  if (!store) {
    store = { frame: 0, dirty: true, snapshot: undefined };
    stores.set(runner, store);
  }
  return store;
}

/** Returns the cached snapshot, building a new object only when something changed. */
function readSnapshot<S extends ParameterSchema>(runner: Runner<S>): RunnerSnapshot<S> {
  const store = storeFor(runner as unknown as Runner<never>);
  const previous = store.snapshot;
  if (
    previous &&
    !store.dirty &&
    previous.sim === runner.sim &&
    previous.state === runner.state &&
    previous.tick === runner.sim.tick &&
    previous.error === runner.error
  ) {
    return previous as unknown as RunnerSnapshot<S>;
  }
  store.dirty = false;
  const next: RunnerSnapshot = {
    state: runner.state,
    tick: runner.sim.tick,
    sim: runner.sim as unknown as Simulation,
    error: runner.error,
    frame: store.frame,
  };
  store.snapshot = next;
  return next as unknown as RunnerSnapshot<S>;
}

/**
 * Creates a {@link Runner} for a model and disposes it on unmount or when the
 * model changes. Options are read once per runner; to change parameters or the
 * seed afterwards, call `runner.restart(...)`.
 *
 * Safe under StrictMode: disposal is deferred to a microtask, so the
 * simulated unmount and remount that StrictMode performs keeps the same runner.
 */
export function useRunner<S extends ParameterSchema>(
  model: Model<S>,
  options?: RunnerOptions<S>,
): Runner<S> {
  const [initialOptions] = useState(options);
  const runner = useMemo(() => new Runner(model, initialOptions), [model, initialOptions]);
  useEffect(() => {
    mounts.set(runner, (mounts.get(runner) ?? 0) + 1);
    return () => {
      mounts.set(runner, (mounts.get(runner) ?? 1) - 1);
      queueMicrotask(() => {
        if (mounts.get(runner) === 0) runner.dispose();
      });
    };
  }, [runner]);
  return runner;
}

/** How many effects currently hold each runner; StrictMode briefly drops this to zero and back. */
const mounts = new WeakMap<object, number>();

/**
 * Subscribes to a runner and re-renders on every frame, state change and
 * error. The returned object is stable between changes, so it can be used in
 * dependency lists.
 */
export function useRunnerState<S extends ParameterSchema>(runner: Runner<S>): RunnerSnapshot<S> {
  return useSyncExternalStore(
    (notify) => {
      const store = storeFor(runner as unknown as Runner<never>);
      const changed = (): void => {
        store.frame++;
        store.dirty = true;
        notify();
      };
      const offs = [
        runner.onFrame(changed),
        runner.onStateChange(changed),
        runner.onError(changed),
      ];
      return () => {
        for (const off of offs) off();
      };
    },
    () => readSnapshot(runner),
    () => readSnapshot(runner),
  );
}
