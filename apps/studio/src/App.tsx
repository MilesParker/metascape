// SPDX-License-Identifier: EPL-2.0
import { models } from '@metascape/models';
import { ModelRunner } from '@metascape/react';
import { useState } from 'react';

/** The model named in the page address (`#life`), or the first one. */
function initialIndex(): number {
  const wanted = decodeURIComponent(window.location.hash.slice(1)).toLowerCase();
  const index = models.findIndex((model) => slug(model.name) === wanted);
  return index >= 0 ? index : 0;
}

const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export function App() {
  const [index, setIndex] = useState(initialIndex);
  const model = models[index]!;

  const choose = (next: number): void => {
    setIndex(next);
    window.history.replaceState(null, '', `#${slug(models[next]!.name)}`);
  };

  return (
    <div className="studio">
      <header className="studio-header">
        <h1 className="studio-title">Metascape Studio</h1>
        <label className="studio-picker">
          Model{' '}
          <select value={index} onChange={(event) => choose(Number(event.target.value))}>
            {models.map((entry, i) => (
              <option key={entry.name} value={i}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
      </header>
      {/* The key gives each model a fresh runner and form state. */}
      <ModelRunner key={model.name} model={model} />
    </div>
  );
}
