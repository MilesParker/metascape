// SPDX-License-Identifier: EPL-2.0
import { Link, useParams, type ErrorComponentProps } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { modelById } from '../catalog';
import { Thumb } from '../library/ModelCard';
import { TopBar } from '../shell/TopBar';

/** Shown while a model's code loads: its picture and name, so the wait has a face. */
export function WorkbenchPending(): ReactElement {
  const { modelId } = useParams({ strict: false });
  const entry = modelId ? modelById(modelId) : undefined;
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="grid flex-1 place-items-center bg-stage">
        {entry && (
          <div className="flex flex-col items-center gap-4 opacity-80">
            <Thumb model={entry} className="size-56 animate-pulse rounded-xl" />
            <p className="text-sm text-muted">Loading {entry.name}…</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function WorkbenchError({ error }: ErrorComponentProps): ReactElement {
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div>
          <h1 className="text-lg font-semibold">Could not open the model</h1>
          <p className="mt-2 max-w-prose text-muted">
            {error instanceof Error ? error.message : String(error)}
          </p>
          <Link
            to="/"
            search={{}}
            className="mt-6 inline-block font-medium text-accent hover:underline"
          >
            Back to the Library
          </Link>
        </div>
      </div>
    </div>
  );
}
