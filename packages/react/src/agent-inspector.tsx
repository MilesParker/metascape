// SPDX-License-Identifier: EPL-2.0
import type { Agent } from '@metascape/engine';
import type { ReactElement } from 'react';
import { humanize } from './labels';

/** Props of {@link AgentInspector}. */
export interface AgentInspectorProps {
  /** The agent (or grid cell) to show; nothing picked shows a hint. */
  readonly agent: Agent | undefined;
  /** Changes on each frame so the values stay live. */
  readonly frame: number;
  /** Readable field names, as in a model's `fields`; `null` hides a field. */
  readonly fields?: Readonly<Record<string, string | null>> | undefined;
}

type Primitive = number | string | boolean;

const isPrimitive = (value: unknown): value is Primitive =>
  typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean';

/** An agent's id, alive status, position and own primitive fields, as name and value. */
export function rowsOf(agent: Agent): [string, Primitive][] {
  const rows: [string, Primitive][] = [
    ['id', agent.id],
    ['alive', agent.alive],
  ];
  // Getter-backed values the engine defines are not own fields: `x` and `y` for
  // grid cells and point agents, `cell` for occupants.
  const shown = new Set(['id', 'alive']);
  const record = agent as unknown as Record<string, unknown>;
  for (const key of ['x', 'y']) {
    const value = record[key];
    if (typeof value === 'number') {
      rows.push([key, value]);
      shown.add(key);
    }
  }
  // Occupants expose the cell they stand on; show its coordinates.
  const cell = record['cell'] as { x?: unknown; y?: unknown } | undefined;
  if (cell && typeof cell.x === 'number' && typeof cell.y === 'number') {
    rows.push(['cell', `(${cell.x}, ${cell.y})`]);
    shown.add('cell');
  }
  for (const key of Object.keys(agent)) {
    const value = record[key];
    if (!shown.has(key) && isPrimitive(value)) rows.push([key, value]);
  }
  return rows;
}

/** One row of an inspector: the field, its readable label and its value as text. */
export interface InspectorRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly raw: Primitive;
}

/**
 * The rows an inspector shows for an agent: labels from `fields` (the model's
 * `fields` metadata) or the field names in words; fields mapped to `null` are
 * left out.
 */
export function inspectorRows(
  agent: Agent,
  fields?: Readonly<Record<string, string | null>>,
): InspectorRow[] {
  const rows: InspectorRow[] = [];
  for (const [key, raw] of rowsOf(agent)) {
    const named = fields?.[key];
    if (named === null) continue;
    const label = named ?? (key === 'id' ? 'Id' : humanize(key));
    rows.push({ key, label, value: show(raw), raw });
  }
  return rows;
}

/** A field value as text: numbers to six significant digits, booleans as yes or no. */
export function show(value: Primitive): string {
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number')
    return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(6)));
  return String(value);
}

/** A small live table of an agent's id, alive status, own number, string and boolean fields, and the engine's getter-backed `x`, `y` and `cell`. */
export function AgentInspector({ agent, frame, fields }: AgentInspectorProps): ReactElement {
  if (!agent) {
    return <p className="ms-muted">Click an agent or cell to inspect it.</p>;
  }
  return (
    <table className="ms-inspector" data-frame={frame}>
      <caption className="ms-visually-hidden">Selected agent</caption>
      <tbody>
        {inspectorRows(agent, fields).map((row) => (
          <tr key={row.key}>
            <th scope="row">{row.label}</th>
            <td>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
