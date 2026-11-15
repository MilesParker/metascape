// SPDX-License-Identifier: EPL-2.0
import {
  formatNumber,
  humanize,
  positionToSpeed,
  speedToPosition,
  timeUnit,
} from '@metascape/react';
import { Copy, Pause, Play, RotateCcw, StepForward, Undo2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { displayKeys } from '../lib/commands';
import { cn } from '../lib/cn';
import { toast } from '../shell/toast';
import { Button } from '../ui/button';
import { Input, Popover, PopoverContent, PopoverTrigger, Slider, Tip } from '../ui/primitives';
import type { Session } from './session';

const MAX_POSITION = 100;

/** Periods per second in words: "30 periods/s", "Max". */
export function speedText(speed: number, unit: string): string {
  return Number.isFinite(speed) ? `${speed} ${unit}/s` : 'Max';
}

/** Why the run ended, or undefined while it can go on. */
function endReason(session: Session): { text: string; failed: boolean } | undefined {
  const { snapshot, root, runner } = session;
  if (runner.failed) {
    const error = runner.error;
    return {
      text: `Failed: ${error instanceof Error ? error.message : String(error)}`,
      failed: true,
    };
  }
  if (snapshot.state !== 'stopped') return undefined;
  return { text: `Ended: ${root.stopReason ?? 'the model stopped'}`, failed: false };
}

/** Runs until a period, then pauses. */
function runUntil(runner: Session['runner'], period: number): void {
  runner.pausePeriod = period;
  runner.start();
}

/** The time now; clicking it sets a time to run to. */
function Clock({
  session,
  large,
}: {
  readonly session: Session;
  readonly large: boolean;
}): ReactElement {
  const { root, runner } = session;
  const unit = timeUnit(root);
  const scale = root.model.period;
  const now = root.period;
  const [text, setText] = useState('');
  const target = Math.round(Number(text));
  const valid = text.trim() !== '' && Number.isFinite(target) && target > root.period;
  const ended = session.snapshot.state === 'stopped';
  const go = (): void => {
    if (!valid) return;
    runUntil(runner, target);
    setText('');
  };
  const readout = (
    <span className={cn('font-mono font-medium tnum', large ? 'text-xl' : 'text-[15px]')}>
      <span className="mr-1.5 font-sans text-xs font-normal text-faint">
        {humanize(unit.singular)}
      </span>
      {formatNumber(now)}
    </span>
  );
  if (ended) return <div className="flex items-baseline gap-2 px-1">{readout}</div>;
  return (
    <Popover>
      <Tip label={`Run to a ${unit.singular}`}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-baseline gap-2 rounded-md px-1.5 py-0.5 hover:bg-line/50"
          >
            {readout}
            {scale && (
              <span className="hidden font-mono text-2xs text-faint tnum sm:inline">
                iteration {root.iteration}
              </span>
            )}
          </button>
        </PopoverTrigger>
      </Tip>
      <PopoverContent align="start" side="top" className="w-60">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            go();
          }}
          className="space-y-2"
        >
          <label className="block text-xs font-medium text-muted" htmlFor="run-to">
            Run to {unit.singular}
          </label>
          <div className="flex gap-2">
            <Input
              id="run-to"
              inputMode="numeric"
              value={text}
              placeholder={formatNumber(now + 100)}
              onChange={(event) => setText(event.target.value)}
              aria-invalid={text !== '' && !valid}
              className="font-mono tnum"
            />
            <Button type="submit" variant="primary" disabled={!valid}>
              Run
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function Seed({ session }: { readonly session: Session }): ReactElement {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const seed = String(session.root.seed);
  return (
    <Popover onOpenChange={() => setDraft(undefined)}>
      <Tip label="The same seed and settings give the same run">
        <PopoverTrigger asChild>
          <button
            type="button"
            className="hidden h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted hover:bg-panel hover:text-fg lg:inline-flex"
          >
            <span className="text-faint">Seed</span>
            <span className="max-w-[10ch] truncate font-mono tnum text-fg">{seed}</span>
          </button>
        </PopoverTrigger>
      </Tip>
      <PopoverContent side="top" className="w-72 space-y-3">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const text = (draft ?? seed).trim();
            if (text === '') return;
            session.reseed(Number.isFinite(Number(text)) ? Number(text) : text);
          }}
          className="space-y-2"
        >
          <label htmlFor="seed" className="block text-xs font-medium text-muted">
            Seed
          </label>
          <div className="flex gap-2">
            <Input
              id="seed"
              value={draft ?? seed}
              onChange={(event) => setDraft(event.target.value)}
              className="font-mono tnum"
            />
            <Button type="submit" disabled={draft === undefined || draft.trim() === seed}>
              Use
            </Button>
          </div>
        </form>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              void navigator.clipboard?.writeText(seed).then(() => toast('Seed copied'));
            }}
          >
            <Copy /> Copy
          </Button>
          <Button size="sm" onClick={() => session.reseed()}>
            New seed
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The row under the world: play, step, restart, speed, the time (click it to
 * run to a time), why the run ended, changes waiting for a restart, and the seed.
 */
export function Transport({
  session,
  large = false,
}: {
  readonly session: Session;
  readonly large?: boolean;
}): ReactElement {
  const { runner, root, snapshot, parameters } = session;
  const [position, setPosition] = useState(() => speedToPosition(runner.iterationsPerSecond));
  const unit = timeUnit(root);
  const running = snapshot.state === 'running';
  const ended = snapshot.state === 'stopped';
  const canStep = snapshot.state === 'ready' || snapshot.state === 'paused';
  const reason = endReason(session);
  const speed = positionToSpeed(position);
  const iconSize = large ? 'icon-lg' : 'icon';
  const pending = parameters.pending;

  return (
    <div
      role="group"
      aria-label="Run controls"
      className={cn(
        'flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-line bg-panel px-2',
        large ? 'py-3' : 'py-1.5',
      )}
    >
      <div className="flex items-center gap-0.5">
        <Tip label={running ? 'Pause' : 'Play'} keys={displayKeys('space')}>
          <Button
            variant="primary"
            size={iconSize}
            className="rounded-full"
            aria-label={running ? 'Pause' : 'Play'}
            disabled={ended}
            onClick={() => (running ? runner.pause() : runner.start())}
          >
            {running ? (
              <Pause className="fill-current" />
            ) : (
              <Play className="translate-x-px fill-current" />
            )}
          </Button>
        </Tip>
        <Tip label="Step" keys=".">
          <Button
            variant="ghost"
            size={iconSize}
            aria-label="Step"
            disabled={!canStep}
            onClick={() => runner.step()}
          >
            <StepForward />
          </Button>
        </Tip>
        <Tip label="Restart" keys="R">
          <Button
            variant={ended ? 'primary' : 'ghost'}
            size={iconSize}
            className={cn(ended && 'rounded-full')}
            aria-label="Restart"
            onClick={session.restart}
          >
            <RotateCcw />
          </Button>
        </Tip>
      </div>

      <div className="flex min-w-36 items-center gap-2 px-1">
        <Slider
          className="w-24 sm:w-28"
          min={0}
          max={MAX_POSITION}
          step={1}
          value={[position]}
          thumbLabels={['Speed']}
          aria-valuetext={speedText(speed, unit.plural)}
          onValueChange={([next]) => {
            if (next === undefined) return;
            setPosition(next);
            runner.setSpeed(positionToSpeed(next));
          }}
        />
        <span className="w-[11ch] truncate font-mono text-2xs text-muted tnum" aria-hidden="true">
          {speedText(speed, unit.plural)}
        </span>
      </div>

      <Clock session={session} large={large} />

      {reason && (
        <span
          role="status"
          className={cn('min-w-0 truncate text-xs', reason.failed ? 'text-danger' : 'text-fg')}
          title={reason.text}
          data-testid="run-ended"
        >
          {reason.text}
        </span>
      )}

      <div className="ml-auto flex items-center gap-1">
        {pending.length > 0 && (
          <div className="flex items-center gap-1">
            <Tip
              label={pending
                .map(
                  (name) =>
                    `${parameters.schema[name]?.label ?? humanize(name)} → ${String(parameters.values[name])}`,
                )
                .join(', ')}
              keys={displayKeys('mod+enter')}
            >
              <Button variant="warn" size="sm" onClick={() => session.apply()}>
                <RotateCcw />
                Restart to apply {pending.length}
              </Button>
            </Tip>
            <Tip label="Discard changes">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Discard changes"
                onClick={parameters.discard}
              >
                <Undo2 />
              </Button>
            </Tip>
          </div>
        )}
        <Seed session={session} />
      </div>
    </div>
  );
}
