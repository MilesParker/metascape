// SPDX-License-Identifier: EPL-2.0
import {
  resolveParameters,
  SettingsStore,
  type Agent,
  type Model,
  type ParameterSchema,
  type ParameterValues,
  type Provenance,
  type RunnerOptions,
  type Simulation,
} from '@metascape/engine';
import { useId, useState, type KeyboardEvent, type ReactElement } from 'react';
import { NO_CUSTOMIZATIONS, type ChartCustomizations } from './chart-customization';
import { AgentInspector } from './agent-inspector';
import { useRunner, useRunnerState } from './hooks';
import { ParameterForm, type FormValue } from './parameter-form';
import { RulesPanel } from './rules-panel';
import { RunControls } from './run-controls';
import { SimulationViews } from './simulation-views';

/** Props of {@link ModelRunner}. */
export interface ModelRunnerProps<S extends ParameterSchema = ParameterSchema> {
  readonly model: Model<S>;
  /** Seed, speed and so on for the runner; read once. */
  readonly options?: RunnerOptions<S>;
}

/** Credits for a model: its authors, publication and any implementation it was ported from. */
export function ProvenanceNote({ provenance }: { readonly provenance: Provenance }): ReactElement {
  const { authors, citation, portedFrom, copyright, note } = provenance;
  return (
    <p className="ms-provenance ms-muted">
      {authors && <span>Model by {authors}. </span>}
      {citation && <cite>{citation} </cite>}
      {portedFrom && <span>Ported from {portedFrom}. </span>}
      {copyright && <span>{copyright} </span>}
      {note && <span>{note}</span>}
    </p>
  );
}

const TABS = [
  { id: 'parameters', label: 'Parameters' },
  { id: 'rules', label: 'Rules' },
] as const;

/** Left and Right arrows (and Home and End) move between tabs, as in the ARIA tabs pattern. */
function moveTab(
  event: KeyboardEvent<HTMLElement>,
  current: 'parameters' | 'rules',
  select: (tab: 'parameters' | 'rules') => void,
  tabsId: string,
): void {
  const index = TABS.findIndex((tab) => tab.id === current);
  const steps: Readonly<Record<string, number>> = {
    ArrowRight: (index + 1) % TABS.length,
    ArrowLeft: (index + TABS.length - 1) % TABS.length,
    Home: 0,
    End: TABS.length - 1,
  };
  const next = steps[event.key];
  if (next === undefined) return;
  event.preventDefault();
  const target = TABS[next]!;
  select(target.id);
  document.getElementById(`${tabsId}-${target.id}`)?.focus();
}

type Values = Readonly<Record<string, FormValue>>;

const differs = (a: Values, b: Values): boolean =>
  Object.keys({ ...a, ...b }).some((key) => a[key] !== b[key]);

/**
 * A complete runner for a model: controls, a parameter form (changes apply on
 * restart), the model's views, and an inspector for the last picked agent or cell.
 */
export function ModelRunner<S extends ParameterSchema>({
  model,
  options,
}: ModelRunnerProps<S>): ReactElement {
  // Rule settings and chart choices belong to the model and outlive each restart.
  const [settings] = useState(() => new SettingsStore());
  const [charts, setCharts] = useState<ChartCustomizations>(NO_CUSTOMIZATIONS);
  const [tab, setTab] = useState<'parameters' | 'rules'>('parameters');
  const tabsId = useId();
  const runner = useRunner(model, {
    ...options,
    onSimulation: (created) => {
      options?.onSimulation?.(created);
      settings.attach(created);
    },
  });
  const { sim, frame } = useRunnerState(runner);
  const [applied, setApplied] = useState<Values>(() => ({
    ...resolveParameters(model.parameters, options?.parameters),
  }));
  const [values, setValues] = useState<Values>(applied);
  const [picked, setPicked] = useState<{ sim: Simulation; agent: Agent } | undefined>(undefined);
  const [applyError, setApplyError] = useState<string | undefined>(undefined);

  const apply = (): void => {
    try {
      runner.restart({ parameters: values as unknown as Partial<ParameterValues<S>> });
      setApplied(values);
      setApplyError(undefined);
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : String(error));
    }
  };

  const inspected = picked?.sim === sim ? picked.agent : undefined;

  return (
    <div className="ms-runner">
      <header className="ms-runner-header">
        <h2 className="ms-runner-title">{model.name}</h2>
        {model.description && <p className="ms-muted">{model.description}</p>}
        {model.provenance && <ProvenanceNote provenance={model.provenance} />}
      </header>
      <RunControls runner={runner} />
      <div className="ms-runner-body">
        <div className="ms-runner-main">
          <SimulationViews
            sim={sim as unknown as Simulation}
            frame={frame}
            onPick={(agent) => setPicked({ sim: sim as unknown as Simulation, agent })}
            customizations={charts}
            onCustomizationsChange={setCharts}
          />
        </div>
        <aside className="ms-runner-side">
          <section className="ms-panel" aria-label="Model settings">
            <div className="ms-tabs" role="tablist" aria-label="Model settings">
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`${tabsId}-${id}`}
                  className="ms-tab"
                  aria-selected={tab === id}
                  aria-controls={`${tabsId}-${id}-panel`}
                  tabIndex={tab === id ? 0 : -1}
                  onClick={() => setTab(id)}
                  onKeyDown={(event) => moveTab(event, tab, setTab, tabsId)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id={`${tabsId}-${tab}-panel`}
              aria-labelledby={`${tabsId}-${tab}`}
              className="ms-tabpanel"
            >
              {tab === 'parameters' ? (
                <>
                  <ParameterForm
                    schema={model.parameters}
                    values={values}
                    onChange={(name, value) =>
                      setValues((previous) => ({ ...previous, [name]: value }))
                    }
                  />
                  {Object.keys(model.parameters).length > 0 && (
                    <>
                      <button
                        type="button"
                        className="ms-button ms-button-primary"
                        disabled={!differs(values, applied)}
                        onClick={apply}
                      >
                        Apply and restart
                      </button>
                      {applyError !== undefined && (
                        <p className="ms-error" role="alert">
                          {applyError}
                        </p>
                      )}
                    </>
                  )}
                </>
              ) : (
                <RulesPanel sim={sim as unknown as Simulation} store={settings} frame={frame} />
              )}
            </div>
          </section>
          <section className="ms-panel" aria-labelledby="ms-inspector-title">
            <h3 className="ms-panel-title" id="ms-inspector-title">
              Inspector
            </h3>
            <AgentInspector agent={inspected} frame={frame} />
          </section>
        </aside>
      </div>
    </div>
  );
}
