// SPDX-License-Identifier: EPL-2.0
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { TopBar } from '../shell/TopBar';

export function NotFound(): ReactElement {
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <main className="grid flex-1 place-items-center p-8 text-center">
        <div>
          <h1 className="text-xl font-semibold">Not found</h1>
          <p className="mt-2 text-muted">The address may be from an older version.</p>
          <Link
            to="/"
            search={{}}
            className="mt-6 inline-block font-medium text-accent hover:underline"
          >
            Browse the Library
          </Link>
        </div>
      </main>
    </div>
  );
}
