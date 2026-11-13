// SPDX-License-Identifier: EPL-2.0
import {
  readScapeSettings,
  type Exploration,
  type Provenance,
  type ScapeSettings,
} from '@metascape/engine';
import { formatNumber, humanize } from '@metascape/react';
import { Link } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import type { ReactElement } from 'react';
import { cn } from '../lib/cn';
import { Button } from '../ui/button';
import type { Session } from './session';
import { useWorkbench, type Tried } from './store';

type Value = number | string | boolean;

const show = (value: Value | undefined): string =>
  value === undefined
    ? '–'
    : typeof value === 'boolean'
      ? value
        ? 'on'
        : 'off'
      : typeof value === 'number'
        ? formatNumber(value)
        : humanize(value);

/** The rules of a scape with a thing to try's switches applied. */
function switched(settings: ScapeSettings, change: NonNullable<Exploration['rules']>[number]) {
  return settings.rules.map((rule) =>
    change.disable?.includes(rule.name)
      ? { ...rule, enabled: false }
      : change.enable?.includes(rule.name)
        ? { ...rule, enabled: true }
        : rule,
  );
}

function scapeSettings(session: Session, scape: string): ScapeSettings | undefined {
  try {
    return readScapeSettings(session.sim.scape(scape));
  } catch {
    return undefined; // A scape the model does not have.
  }
}

/** What a thing to try changes, in words such as "Vision max 6 → 1" and "Growback off". */
export function describeExploration(
  session: Session,
  exploration: Exploration,
  before?: Tried,
): string[] {
  const { parameters } = session;
  const lines: string[] = [];
  for (const [name, value] of Object.entries(exploration.parameters ?? {})) {
    if (value === undefined) continue;
    const label = parameters.schema[name]?.label ?? humanize(name);
    const from = before?.parameters[name] ?? parameters.values[name];
    lines.push(
      typeof value === 'boolean'
        ? `${label} ${show(value)}`
        : `${label} ${show(from)} → ${show(value as Value)}`,
    );
  }
  for (const change of exploration.rules ?? []) {
    for (const name of change.disable ?? []) lines.push(`${name} off`);
    for (const name of change.enable ?? []) lines.push(`${name} on`);
  }
  return lines;
}

/** Whether the model now runs with everything a thing to try sets. */
function isApplied(session: Session, exploration: Exploration): boolean {
  const { parameters } = session;
  for (const [name, value] of Object.entries(exploration.parameters ?? {})) {
    if (value !== undefined && parameters.values[name] !== value) return false;
  }
  for (const change of exploration.rules ?? []) {
    const settings = scapeSettings(session, change.scape);
    if (!settings) continue;
    for (const rule of settings.rules) {
      if (change.disable?.includes(rule.name) && rule.enabled) return false;
      if (change.enable?.includes(rule.name) && !rule.enabled) return false;
    }
  }
  return true;
}

/** Applies a thing to try: live parameters and rules at once, the rest with one restart. */
export function applyExploration(session: Session, exploration: Exploration): void {
  const { parameters, rules } = session;
  const before: Tried = {
    title: exploration.title,
    parameters: Object.fromEntries(
      Object.keys(exploration.parameters ?? {}).map((name) => [name, parameters.values[name]!]),
    ),
    rules: Object.fromEntries(
      (exploration.rules ?? []).flatMap((change) => {
        const settings = scapeSettings(session, change.scape);
        return settings ? [[change.scape, settings]] : [];
      }),
    ),
  };
  const atRestart: Record<string, Value> = {};
  for (const [name, value] of Object.entries(exploration.parameters ?? {})) {
    if (value === undefined) continue;
    if (parameters.isLive(name)) parameters.set(name, value as Value);
    else atRestart[name] = value as Value;
  }
  for (const change of exploration.rules ?? []) {
    const settings = scapeSettings(session, change.scape);
    if (settings) rules.change(change.scape, { rules: switched(settings, change) });
  }
  if (Object.keys(atRestart).length > 0) session.restartWith(atRestart);
  useWorkbench.getState().setTried(before);
}

/** Puts back what the last thing to try replaced. */
export function undoExploration(session: Session, tried: Tried): void {
  const { parameters, rules } = session;
  const atRestart: Record<string, Value> = {};
  for (const [name, value] of Object.entries(tried.parameters)) {
    if (parameters.isLive(name)) parameters.set(name, value);
    else atRestart[name] = value;
  }
  for (const [scape, settings] of Object.entries(tried.rules)) rules.change(scape, settings);
  if (Object.keys(atRestart).length > 0) session.restartWith(atRestart);
  useWorkbench.getState().setTried(undefined);
}

/** Where a model comes from: authors, publication and the implementation it was ported from. */
export function ProvenanceBlock({ provenance }: { readonly provenance: Provenance }): ReactElement {
  const rows: [string, string | undefined][] = [
    ['Model by', provenance.authors],
    ['Published in', provenance.citation],
    ['Ported from', provenance.portedFrom],
    ['Copyright', provenance.copyright],
    ['Note', provenance.note],
  ];
  return (
    <section aria-labelledby="provenance" className="rounded-lg border border-line bg-surface p-3">
      <h3 id="provenance" className="mb-2 text-xs font-semibold">
        Provenance
      </h3>
      <dl className="space-y-2 text-xs">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="text-2xs font-medium tracking-wide text-faint uppercase">{label}</dt>
              <dd className={cn('mt-0.5 text-pretty', label === 'Published in' && 'italic')}>
                {value}
              </dd>
            </div>
          ))}
      </dl>
    </section>
  );
}

export function Explorations({ session }: { readonly session: Session }): ReactElement | null {
  const tried = useWorkbench((state) => state.tried);
  const explorations = session.model.explorations ?? [];
  if (explorations.length === 0) return null;
  return (
    <section aria-labelledby="things-to-try">
      <h3 id="things-to-try" className="mb-2 text-xs font-semibold">
        Things to try
      </h3>
      <ul className="space-y-2">
        {explorations.map((exploration) => {
          // Some only describe something to do by hand; there is nothing to apply.
          const settable =
            Object.keys(exploration.parameters ?? {}).length > 0 ||
            (exploration.rules ?? []).length > 0;
          const applied = settable && isApplied(session, exploration);
          const mine = applied && tried?.title === exploration.title ? tried : undefined;
          const changes = describeExploration(session, exploration, mine);
          return (
            <li
              key={exploration.title}
              className={cn(
                'rounded-lg border bg-surface p-2.5',
                applied ? 'border-accent/60' : 'border-line',
              )}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">{exploration.title}</p>
                  {exploration.description && (
                    <p className="mt-0.5 text-xs text-muted">{exploration.description}</p>
                  )}
                </div>
                {mine ? (
                  <Button size="sm" onClick={() => undoExploration(session, mine)}>
                    Undo
                  </Button>
                ) : (
                  settable &&
                  !applied && (
                    <Button size="sm" onClick={() => applyExploration(session, exploration)}>
                      Try
                    </Button>
                  )
                )}
              </div>
              {changes.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 font-mono text-2xs text-muted tnum">
                  {changes.map((line) => (
                    <li key={line} className="flex items-center gap-1.5">
                      {applied ? (
                        <Check className="size-3 shrink-0 text-accent" aria-label="applied" />
                      ) : (
                        <span className="size-3 shrink-0" aria-hidden="true" />
                      )}
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** What the model is, things to try, and where it comes from. */
export function AboutPanel({ session }: { readonly session: Session }): ReactElement {
  const { model, entry } = session;
  return (
    <div data-rail-scroll className="h-full space-y-5 overflow-y-auto p-3 scrollbar-thin">
      <section>
        <h2 className="text-sm font-semibold tracking-tight">{model.name}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted text-pretty">
          {model.description}
        </p>
        {entry.tags.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1">
            {entry.tags.map((tag) => (
              <li key={tag}>
                <Link
                  to="/"
                  search={{ q: tag }}
                  className="inline-flex h-5 items-center rounded-full border border-line px-2 text-2xs text-muted hover:border-line-strong hover:text-fg"
                >
                  {tag}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Explorations session={session} />
      {model.provenance && <ProvenanceBlock provenance={model.provenance} />}
    </div>
  );
}
