// SPDX-License-Identifier: EPL-2.0
import {
  resolveParameters,
  type Agent,
  type Model,
  type ParameterSchema,
  type ParameterValues,
  type Provenance,
  type RunnerOptions,
  type Simulation,
} from '@metascape/engine';
import { useState, type ReactElement } from 'react';
import { AgentInspector } from './agent-inspector';
import { useRunner, useRunnerState } from './hooks';
import { ParameterForm, type FormValue } from './parameter-form';
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
  const runner = useRunner(model, options);
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
          />
        </div>
        <aside className="ms-runner-side">
          <section className="ms-panel" aria-labelledby="ms-params-title">
            <h3 className="ms-panel-title" id="ms-params-title">
              Parameters
            </h3>
            <ParameterForm
              schema={model.parameters}
              values={values}
              onChange={(name, value) => setValues((previous) => ({ ...previous, [name]: value }))}
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
