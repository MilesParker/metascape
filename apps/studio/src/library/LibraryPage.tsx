// SPDX-License-Identifier: EPL-2.0
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useMemo, useRef, type ReactElement } from 'react';
import { libraryFamilies, manifest } from '../catalog';
import { useCommands } from '../lib/commands';
import { TopBar } from '../shell/TopBar';
import { Kbd } from '../ui/primitives';
import { FamilyCard } from './ModelCard';

/** Every family of models as one grid of cards, with a search. */
export function LibraryPage(): ReactElement {
  const search = useSearch({ from: '/' });
  const navigate = useNavigate({ from: '/' });
  const input = useRef<HTMLInputElement>(null);
  const query = search.q ?? '';
  const results = useMemo(() => libraryFamilies(query), [query]);

  useCommands([
    {
      id: 'library-search',
      label: 'Search',
      group: 'Library',
      keys: '/',
      run: () => input.current?.focus(),
    },
  ]);

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <main className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-[1400px] px-4 pb-24 sm:px-8">
          <header className="flex flex-wrap items-end gap-x-8 gap-y-4 pt-8 pb-6 sm:pt-10">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
              <p className="mt-1 text-[13px] text-muted">
                {manifest.models.length} agent-based models in {manifest.families.length} families,
                from Ascape, Eclipse AMP, the Brookings Institution and Metascape.
              </p>
            </div>
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
              <input
                ref={input}
                type="search"
                value={query}
                onChange={(event) =>
                  void navigate({
                    search: { q: event.target.value || undefined },
                    replace: true,
                  })
                }
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    void navigate({ search: {}, replace: true });
                    event.currentTarget.blur();
                  }
                  if (event.key === 'Enter' && results[0]) {
                    void navigate({
                      to: '/models/$modelId',
                      params: { modelId: results[0].model.id },
                      search: {},
                    });
                  }
                }}
                placeholder="Search names, topics, authors"
                aria-label="Search models"
                className="h-9 w-full rounded-lg border border-line bg-surface pr-10 pl-9 text-sm placeholder:text-faint focus:border-accent focus:outline-none"
              />
              <Kbd className="absolute top-1/2 right-2.5 -translate-y-1/2">/</Kbd>
            </div>
          </header>

          {results.length === 0 ? (
            <p className="py-16 text-center text-muted">No matches.</p>
          ) : (
            <ul
              className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4"
              aria-label={query ? 'Matching families' : 'Families'}
            >
              {results.map(({ family, model }) => (
                <li key={family.id} className="flex [&>a]:flex-1">
                  <FamilyCard family={family} model={model} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
