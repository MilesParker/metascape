// SPDX-License-Identifier: EPL-2.0
import {
  ParameterError,
  resolveParameters,
  type Parameter,
  type ParameterSchema,
  type ParameterValues,
} from '@metascape/engine';
import { useId, useState, type ReactElement } from 'react';

/** A parameter value as the form handles it. */
export type FormValue = number | string | boolean;

/** Props of {@link ParameterForm}. */
export interface ParameterFormProps {
  readonly schema: ParameterSchema;
  /** The current values, by parameter name. */
  readonly values: Readonly<Record<string, FormValue>>;
  /** Called with a parameter's name and its new value, only when the value is valid. */
  readonly onChange: (name: string, value: FormValue) => void;
}

/** The engine's complaint about a value, or undefined when it is acceptable. */
function validate(schema: ParameterSchema, name: string, value: unknown): string | undefined {
  try {
    resolveParameters(schema, { [name]: value } as Partial<ParameterValues<ParameterSchema>>);
    return undefined;
  } catch (error) {
    if (error instanceof ParameterError) return error.message;
    throw error;
  }
}

function parseNumber(text: string): number {
  return text.trim() === '' ? Number.NaN : Number(text);
}

interface FieldProps {
  readonly name: string;
  readonly parameter: Parameter;
  readonly value: FormValue | undefined;
  readonly schema: ParameterSchema;
  readonly onChange: (name: string, value: FormValue) => void;
}

function Field({ name, parameter, value, schema, onChange }: FieldProps): ReactElement {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const label = parameter.label ?? name;
  const current = value ?? parameter.default;
  const describedBy =
    [parameter.description ? hintId : undefined, problem ? errorId : undefined]
      .filter(Boolean)
      .join(' ') || undefined;

  const commit = (next: FormValue): boolean => {
    const message = validate(schema, name, next);
    setProblem(message);
    if (message !== undefined) return false;
    onChange(name, next);
    return true;
  };

  let control: ReactElement;
  if (parameter.type === 'boolean') {
    control = (
      <input
        id={id}
        type="checkbox"
        checked={current === true}
        aria-describedby={describedBy}
        onChange={(event) => commit(event.target.checked)}
      />
    );
  } else if (parameter.type === 'choice') {
    control = (
      <select
        id={id}
        value={String(current)}
        aria-describedby={describedBy}
        onChange={(event) => commit(event.target.value)}
      >
        {parameter.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  } else if (parameter.type === 'text') {
    control = (
      <input
        id={id}
        type="text"
        value={String(current)}
        aria-describedby={describedBy}
        onChange={(event) => commit(event.target.value)}
      />
    );
  } else {
    const integer = parameter.type === 'int';
    const ranged = parameter.min !== undefined && parameter.max !== undefined;
    const number = (
      <input
        id={id}
        type="number"
        inputMode={integer ? 'numeric' : 'decimal'}
        step={integer ? 1 : 'any'}
        {...(parameter.min !== undefined && { min: parameter.min })}
        {...(parameter.max !== undefined && { max: parameter.max })}
        value={draft ?? String(current)}
        aria-invalid={problem !== undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = parseNumber(event.target.value);
          if (Number.isNaN(parsed)) {
            setProblem(`Parameter "${name}": expected a number`);
          } else {
            commit(parsed);
          }
        }}
        onBlur={() => {
          if (problem === undefined) setDraft(undefined);
        }}
      />
    );
    control = ranged ? (
      <span className="ms-range">
        <input
          type="range"
          aria-label={`${label} slider`}
          min={parameter.min}
          max={parameter.max}
          step={integer ? 1 : (parameter.max! - parameter.min!) / 100}
          value={Number(current)}
          onChange={(event) => {
            setDraft(undefined);
            commit(Number(event.target.value));
          }}
        />
        {number}
      </span>
    ) : (
      number
    );
  }

  return (
    <div className={`ms-field ms-field-${parameter.type}`}>
      <label htmlFor={id}>{label}</label>
      {control}
      {parameter.description && (
        <p className="ms-hint" id={hintId}>
          {parameter.description}
        </p>
      )}
      {problem !== undefined && (
        <p className="ms-error" id={errorId} role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}

/**
 * One labelled input per parameter: a number input (plus a range slider when
 * both bounds are known), checkbox, select or text field. Invalid input shows
 * the engine's validation message and never reaches `onChange`.
 */
export function ParameterForm({ schema, values, onChange }: ParameterFormProps): ReactElement {
  const names = Object.keys(schema);
  if (names.length === 0) return <p className="ms-muted">This model has no parameters.</p>;
  return (
    <form className="ms-form" onSubmit={(event) => event.preventDefault()} noValidate>
      {names.map((name) => (
        <Field
          key={name}
          name={name}
          parameter={schema[name]!}
          value={values[name]}
          schema={schema}
          onChange={onChange}
        />
      ))}
    </form>
  );
}
