// SPDX-License-Identifier: EPL-2.0
import { FlaskConical, GitCompareArrows, Grid2x2, Rewind } from 'lucide-react';
import type { ReactElement } from 'react';
import { TopBar } from '../shell/TopBar';

const PLANNED = [
  {
    icon: FlaskConical,
    title: 'Experiments and sweeps',
    text: 'Run a model many times across parameters and seeds, and chart the outcomes.',
  },
  {
    icon: GitCompareArrows,
    title: 'Side-by-side runs',
    text: 'Two configurations of one model, stepping together.',
  },
  {
    icon: Rewind,
    title: 'Rewinding the world',
    text: 'Going back through a run, the world as well as its charts. Needs snapshots from the engine.',
  },
  {
    icon: Grid2x2,
    title: 'Model editor',
    text: 'Building models in the declarative format, with a live preview.',
  },
];

/** The slot for the Lab: what it will hold, not yet built. */
export function LabPage(): ReactElement {
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-14">
          <h1 className="text-2xl font-semibold tracking-tight">Lab</h1>
          <p className="mt-2 text-[13px] text-muted">Not built yet. Planned:</p>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {PLANNED.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-xl border border-dashed border-line-strong p-5">
                <Icon className="size-5 text-muted" aria-hidden="true" />
                <h2 className="mt-3 font-semibold">{title}</h2>
                <p className="mt-1 text-[13px] text-muted">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
