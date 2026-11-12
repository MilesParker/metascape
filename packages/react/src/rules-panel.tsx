// SPDX-License-Identifier: EPL-2.0
import {
  readScapeSettings,
  ruleKey,
  type Sampling,
  type ScapeSettings,
  type Schedule,
  type SettingsStore,
  type Simulation,
  type VisitOrder,
} from '@metascape/engine';
import { useEffect, useId, useRef, useState, type ReactElement } from 'react';

/** Props of {@link RulesPanel}. */
export interface RulesPanelProps {
  readonly sim: Simulation;
  /** Remembers the changes so they apply again after a restart. */
  readonly store: SettingsStore;
  /** Changes on each frame; the panel reads the live scapes, so this only prompts a redraw. */
  readonly frame?: number;
}

interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
}

const SCHEDULES: readonly Choice<Schedule>[] = [
  { value: 'byAgent', label: 'By agent' },
  { value: 'byRule', label: 'By rule' },
];
const ORDERS: readonly Choice<VisitOrder>[] = [
  { value: 'shuffled', label: 'Shuffled' },
  { value: 'sequential', label: 'Sequential' },
];
const SAMPLINGS: readonly Choice<Sampling>[] = [
  { value: 'tour', label: 'Complete tour' },
  { value: 'draw', label: 'Repeated draw' },
];

function Radios<T extends string>({
  legend,
  name,
  choices,
  value,
  onChange,
  hint,
}: {
  readonly legend: string;
  readonly name: string;
  readonly choices: readonly Choice<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly hint?: string;
}): ReactElement {
  return (
    <fieldset className="ms-fieldset" title={hint}>
      <legend>{legend}</legend>
      {choices.map((choice) => (
        <label key={choice.value} className="ms-inline-label">
          <input
            type="radio"
            name={name}
            checked={value === choice.value}
            onChange={() => onChange(choice.value)}
          />
          {choice.label}
        </label>
      ))}
    </fieldset>
  );
}

/**
 * Edits how a simulation's scapes run, live: which rules are on, the order
 * they execute in, whether agents or rules go first, the order agents are
 * visited in, and how many act each step. Changes apply to the running
 * simulation at once and are kept for restarts until reset.
 */
export function RulesPanel({ sim, store }: RulesPanelProps): ReactElement {
  const id = useId();
  const scapes = sim.scapes.filter((scape) => scape.rules.length > 0);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const scape = scapes.find((s) => s.name === selected) ?? scapes[0];
  const [, redraw] = useState(0);
  const [error, setError] = useState<string | undefined>(undefined);
  const pendingFocus = useRef<{ key: string; direction: 'up' | 'down' } | undefined>(undefined);
  const listRef = useRef<HTMLOListElement>(null);
  const [activationsText, setActivationsText] = useState<string | undefined>(undefined);

  // After a rule moves, put the keyboard focus back on the button that moved it.
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = undefined;
    const row = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-rule-key]') ?? [])].find(
      (element) => element.dataset.ruleKey === pending.key,
    );
    const wanted = row?.querySelector<HTMLButtonElement>(
      `button[data-move="${pending.direction}"]`,
    );
    const other = row?.querySelector<HTMLButtonElement>('button:not(:disabled)');
    (wanted && !wanted.disabled ? wanted : other)?.focus();
  });

  if (!scape) return <p className="ms-muted">This model has no rules to edit.</p>;

  const settings = readScapeSettings(scape);
  const change = (patch: Partial<ScapeSettings>): void => {
    try {
      store.set(sim, scape.name, { ...readScapeSettings(scape), ...patch });
      setError(undefined);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    }
    redraw((n) => n + 1);
  };
  const toggle = (index: number, enabled: boolean): void =>
    change({ rules: settings.rules.map((rule, i) => (i === index ? { ...rule, enabled } : rule)) });
  const move = (index: number, by: -1 | 1): void => {
    const rules = [...settings.rules];
    const [moved] = rules.splice(index, 1);
    if (!moved) return;
    rules.splice(index + by, 0, moved);
    pendingFocus.current = { key: ruleKey(moved), direction: by < 0 ? 'up' : 'down' };
    change({ rules });
  };
  const all = settings.activations === null;
  const activationsValue =
    activationsText ?? String(settings.activations ?? Math.max(1, scape.size));
  const setActivations = (text: string): void => {
    setActivationsText(text);
    const n = Number(text);
    if (text.trim() !== '' && Number.isInteger(n) && n >= 1) change({ activations: n });
  };

  return (
    <div className="ms-rules">
      {scapes.length > 1 && (
        <label className="ms-field">
          <span>Scape</span>
          <select
            value={scape.name}
            onChange={(event) => {
              setSelected(event.target.value);
              setActivationsText(undefined);
              setError(undefined);
            }}
          >
            {scapes.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <h4 className="ms-subtitle" id={`${id}-rules`}>
        Rules
        <span className="ms-muted"> (top runs first)</span>
      </h4>
      <ol className="ms-rule-list" aria-labelledby={`${id}-rules`} ref={listRef}>
        {settings.rules.map((rule, index) => {
          const key = ruleKey(rule);
          return (
            <li key={key} className="ms-rule" data-rule-key={key}>
              <label className="ms-inline-label ms-rule-name">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(event) => toggle(index, event.target.checked)}
                />
                {rule.name}
              </label>
              <button
                type="button"
                className="ms-button ms-button-small"
                data-move="up"
                disabled={index === 0}
                aria-label={`Move ${rule.name} up (execute before)`}
                title="Move up (execute before)"
                onClick={() => move(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="ms-button ms-button-small"
                data-move="down"
                disabled={index === settings.rules.length - 1}
                aria-label={`Move ${rule.name} down (execute after)`}
                title="Move down (execute after)"
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
            </li>
          );
        })}
      </ol>

      <Radios
        legend="Execution order"
        name={`${id}-schedule`}
        choices={SCHEDULES}
        value={settings.schedule}
        onChange={(schedule) => change({ schedule })}
        hint="By agent: each agent runs all rules before the next agent. By rule: each rule runs for all agents before the next rule."
      />
      <Radios
        legend="Visit order"
        name={`${id}-order`}
        choices={ORDERS}
        value={settings.order}
        onChange={(order) => change({ order })}
      />
      <Radios
        legend="Execution style"
        name={`${id}-sampling`}
        choices={SAMPLINGS}
        value={settings.sampling}
        onChange={(sampling) => change({ sampling })}
        hint="Complete tour: each agent acts once. Repeated draw: agents are drawn at random, so one may act several times."
      />
      <fieldset className="ms-fieldset">
        <legend>Agents per step</legend>
        <label className="ms-inline-label">
          <input
            type="radio"
            name={`${id}-count`}
            checked={all}
            onChange={() => {
              setActivationsText(undefined);
              change({ activations: null });
            }}
          />
          All
        </label>
        <label className="ms-inline-label">
          <input
            type="radio"
            name={`${id}-count`}
            checked={!all}
            onChange={() => change({ activations: Number(activationsValue) || 1 })}
          />
          Only
        </label>
        <input
          type="number"
          className="ms-number"
          min={1}
          step={1}
          aria-label="Number of agents per step"
          disabled={all}
          value={activationsValue}
          onChange={(event) => setActivations(event.target.value)}
        />
      </fieldset>
      {error !== undefined && (
        <p className="ms-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="ms-button"
        disabled={!store.customized}
        onClick={() => {
          store.reset(sim);
          setActivationsText(undefined);
          setError(undefined);
          redraw((n) => n + 1);
        }}
      >
        Reset to model defaults
      </button>
    </div>
  );
}
