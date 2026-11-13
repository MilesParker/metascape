// SPDX-License-Identifier: EPL-2.0
import type { ReactElement } from 'react';

/** The Metascape mark: a few cells of a lattice, some alive. */
export function Logo({ className }: { readonly className?: string }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect width="24" height="24" rx="6" className="fill-fg" />
      <g className="fill-accent">
        <rect x="5" y="5" width="4" height="4" rx="1" />
        <rect x="10" y="5" width="4" height="4" rx="1" opacity="0.45" />
        <rect x="5" y="10" width="4" height="4" rx="1" opacity="0.45" />
        <rect x="10" y="10" width="4" height="4" rx="1" />
        <rect x="15" y="10" width="4" height="4" rx="1" opacity="0.45" />
        <rect x="10" y="15" width="4" height="4" rx="1" opacity="0.45" />
        <rect x="15" y="15" width="4" height="4" rx="1" />
      </g>
    </svg>
  );
}
