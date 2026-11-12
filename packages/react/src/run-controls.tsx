// SPDX-License-Identifier: EPL-2.0
import type { ParameterSchema, Runner } from '@metascape/engine';
import { useId, useState, type ReactElement } from 'react';
import { useRunnerState } from './hooks';

/** The highest slider position, which means "as fast as possible". */
const MAX_POSITION = 100;
/** The slider position for 1,000 ticks per second; one step further is Max. */
const TOP_POSITION = MAX_POSITION - 1;
const MIN_SPEED = 1;
const MAX_SPEED = 1000;

/** Converts a speed slider position (0..100) to ticks per second: logarithmic from 1 to 1,000, then `Infinity`. */
export function positionToSpeed(position: number): number {
  if (position >= MAX_POSITION) return Infinity;
  const clamped = Math.max(0, position);
  const speed = MIN_SPEED * (MAX_SPEED / MIN_SPEED) ** (clamped / TOP_POSITION);
  return speed < 10 ? Math.round(speed * 10) / 10 : Math.round(speed);
}

/** The inverse of {@link positionToSpeed}, rounded to a whole slider step. */
export function speedToPosition(speed: number): number {
  if (!Number.isFinite(speed)) return MAX_POSITION;
  const clamped = Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
  return Math.round(
    (Math.log(clamped / MIN_SPEED) / Math.log(MAX_SPEED / MIN_SPEED)) * TOP_POSITION,
  );
}

function describeSpeed(speed: number): string {
  return Number.isFinite(speed) ? `${speed} ticks/s` : 'Max';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseSeed(text: string): number | string {
  const trimmed = text.trim();
  return trimmed !== '' && Number.isFinite(Number(trimmed)) ? Number(trimmed) : text;
}

/** Props of {@link RunControls}. */
export interface RunControlsProps<S extends ParameterSchema = ParameterSchema> {
  readonly runner: Runner<S>;
}

/**
 * Start/Pause, Step and Restart buttons, a logarithmic speed slider (1 to
 * 1,000 ticks per second, then Max), a read-out of tick, state and seed, and
 * an editable seed that is used on the next restart.
 */
export function RunControls<S extends ParameterSchema>({
  runner,
}: RunControlsProps<S>): ReactElement {
  const { state, tick, sim, error } = useRunnerState(runner);
  const speedId = useId();
  const seedId = useId();
  const [position, setPosition] = useState(() => speedToPosition(runner.ticksPerSecond));
  const [seedDraft, setSeedDraft] = useState<string | undefined>(undefined);
  const [restartError, setRestartError] = useState<string | undefined>(undefined);

  const running = state === 'running';
  const canToggle = state !== 'stopped';
  const canStep = state === 'ready' || state === 'paused';
  const failure = runner.failed ? errorMessage(error) : restartError;
  const speed = positionToSpeed(position);

  const restart = (): void => {
    try {
      runner.restart(seedDraft === undefined ? {} : { seed: parseSeed(seedDraft) });
      setSeedDraft(undefined);
      setRestartError(undefined);
    } catch (thrown) {
      setRestartError(errorMessage(thrown));
    }
  };

  return (
    <div className="ms-controls" role="group" aria-label="Run controls">
      <div className="ms-controls-buttons">
        <button
          type="button"
          className="ms-button ms-button-primary"
          disabled={!canToggle}
          onClick={() => (running ? runner.pause() : runner.start())}
        >
          {running ? 'Pause' : 'Start'}
        </button>
        <button
          type="button"
          className="ms-button"
          disabled={!canStep}
          onClick={() => runner.step()}
        >
          Step
        </button>
        <button type="button" className="ms-button" onClick={restart}>
          Restart
        </button>
      </div>
      <div className="ms-field ms-speed">
        <label htmlFor={speedId}>Speed</label>
        <input
          id={speedId}
          type="range"
          min={0}
          max={MAX_POSITION}
          step={1}
          value={position}
          aria-valuetext={describeSpeed(speed)}
          onChange={(event) => {
            const next = Number(event.target.value);
            setPosition(next);
            runner.setSpeed(positionToSpeed(next));
          }}
        />
        <output htmlFor={speedId}>{describeSpeed(speed)}</output>
      </div>
      <div className="ms-field ms-seed">
        <label htmlFor={seedId}>Seed (used on restart)</label>
        <input
          id={seedId}
          type="text"
          value={seedDraft ?? String(sim.seed)}
          onChange={(event) => setSeedDraft(event.target.value)}
        />
      </div>
      <dl className="ms-readout" aria-live="off">
        <div>
          <dt>Tick</dt>
          <dd data-testid="ms-tick">{tick}</dd>
        </div>
        <div>
          <dt>State</dt>
          <dd data-testid="ms-state">{state}</dd>
        </div>
        <div>
          <dt>Seed</dt>
          <dd data-testid="ms-seed">{String(sim.seed)}</dd>
        </div>
      </dl>
      {failure !== undefined && (
        <p className="ms-error" role="alert">
          {failure}
        </p>
      )}
    </div>
  );
}
