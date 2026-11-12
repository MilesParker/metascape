// SPDX-License-Identifier: EPL-2.0
import type { Model } from '@metascape/engine';
import { catalog } from '@metascape/models';
import { ModelRunner } from '@metascape/react';
import { compileModel, exampleSpecs } from '@metascape/spec';
import { useState } from 'react';
import { slug } from './slug';

interface Entry {
  /** The address hash that selects this model. */
  readonly id: string;
  readonly model: Model;
}

interface Group {
  readonly id: string;
  readonly name: string;
  readonly collection: string;
  readonly description: string | undefined;
  readonly entries: readonly Entry[];
}

/** The families on offer: those written in TypeScript, then the models written purely as data. */
const groups: readonly Group[] = [
  ...catalog.map((family) => ({
    id: family.id,
    name: family.name,
    collection: family.collection,
    description: family.description,
    entries: family.models.map((model) => ({ id: slug(model.name), model })),
  })),
  {
    id: 'metascape-data',
    name: 'Written as data',
    collection: 'Metascape examples',
    description: 'Models defined in the declarative model format, with no model code.',
    entries: Object.entries(exampleSpecs).map(([key, spec]) => ({
      id: `data-${slug(key)}`,
      model: compileModel(spec),
    })),
  },
];

/** Collection names in catalogue order, each with its families. */
const collections: readonly (readonly [string, readonly Group[]])[] = [
  ...new Set(groups.map((group) => group.collection)),
].map((collection) => [collection, groups.filter((group) => group.collection === collection)]);

const groupOf = (id: string): Group | undefined =>
  groups.find((group) => group.entries.some((entry) => entry.id === id));

/** The model named in the page address (`#sugarscape`), or the first one. */
function initialId(): string {
  const wanted = decodeURIComponent(window.location.hash.slice(1)).toLowerCase();
  return groupOf(wanted) ? wanted : groups[0]!.entries[0]!.id;
}

export function App() {
  const [id, setId] = useState(initialId);
  const group = groupOf(id)!;
  const { model } = group.entries.find((entry) => entry.id === id)!;

  const choose = (next: string): void => {
    setId(next);
    window.history.replaceState(null, '', `#${next}`);
  };

  return (
    <div className="studio">
      <header className="studio-header">
        <h1 className="studio-title">Metascape Studio</h1>
        <div className="studio-pickers">
          <label className="studio-picker">
            Family{' '}
            <select
              value={group.id}
              onChange={(event) =>
                choose(groups.find((g) => g.id === event.target.value)!.entries[0]!.id)
              }
            >
              {collections.map(([collection, families]) => (
                <optgroup key={collection} label={collection}>
                  {families.map((family) => (
                    <option key={family.id} value={family.id}>
                      {family.name} ({family.entries.length})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="studio-picker">
            Model{' '}
            <select value={id} onChange={(event) => choose(event.target.value)}>
              {group.entries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.model.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      {group.description && <p className="studio-family">{group.description}</p>}
      {/* The key gives each model a fresh runner and form state. */}
      <ModelRunner key={id} model={model} />
    </div>
  );
}
