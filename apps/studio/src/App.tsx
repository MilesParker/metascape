// SPDX-License-Identifier: EPL-2.0
import type { Model } from '@metascape/engine';
import { models } from '@metascape/models';
import { ModelRunner } from '@metascape/react';
import { compileModel, exampleSpecs } from '@metascape/spec';
import { useState } from 'react';
import { slug } from './slug';

interface Entry {
  readonly id: string;
  readonly model: Model;
}

interface Group {
  readonly label: string;
  readonly entries: readonly Entry[];
}

/** The models on offer: those written in TypeScript, and those written purely as data. */
const groups: readonly Group[] = [
  {
    label: 'Written in code',
    entries: models.map((model) => ({ id: slug(model.name), model })),
  },
  {
    label: 'Written as data',
    entries: Object.entries(exampleSpecs).map(([key, spec]) => ({
      id: `data-${slug(key)}`,
      model: compileModel(spec),
    })),
  },
];
const entries = groups.flatMap((group) => group.entries);

/** The model named in the page address (`#sugarscape`), or the first one. */
function initialId(): string {
  const wanted = decodeURIComponent(window.location.hash.slice(1)).toLowerCase();
  return entries.some((entry) => entry.id === wanted) ? wanted : entries[0]!.id;
}

export function App() {
  const [id, setId] = useState(initialId);
  const { model } = entries.find((entry) => entry.id === id)!;

  const choose = (next: string): void => {
    setId(next);
    window.history.replaceState(null, '', `#${next}`);
  };

  return (
    <div className="studio">
      <header className="studio-header">
        <h1 className="studio-title">Metascape Studio</h1>
        <label className="studio-picker">
          Model{' '}
          <select value={id} onChange={(event) => choose(event.target.value)}>
            {groups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.entries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.model.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </header>
      {/* The key gives each model a fresh runner and form state. */}
      <ModelRunner key={id} model={model} />
    </div>
  );
}
