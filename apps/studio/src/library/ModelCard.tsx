// SPDX-License-Identifier: EPL-2.0
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { sourceOf, type ManifestFamily, type ManifestModel } from '../catalog';
import { cn } from '../lib/cn';

/** A model's pre-rendered picture, crisp for lattices, letterboxed in its box. */
export function Thumb({
  model,
  className,
}: {
  readonly model: ManifestModel;
  readonly className?: string;
}): ReactElement {
  const { thumb } = model;
  return (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden bg-stage',
        className,
      )}
    >
      <img
        src={`${import.meta.env.BASE_URL}${thumb.file}`}
        alt=""
        loading="lazy"
        decoding="async"
        width={thumb.width}
        height={thumb.height}
        className="max-h-full max-w-full object-contain"
        style={{
          imageRendering: thumb.pixelated ? 'pixelated' : 'auto',
          aspectRatio: `${thumb.width} / ${thumb.height}`,
          height: thumb.height >= thumb.width ? '100%' : 'auto',
          width: thumb.width > thumb.height ? '100%' : 'auto',
        }}
      />
    </div>
  );
}

/**
 * A family in the Library: picture, name, summary, how many models, and where
 * it came from. It opens `model`, the family's first or the best search match.
 */
export function FamilyCard({
  family,
  model,
}: {
  readonly family: ManifestFamily;
  readonly model: ManifestModel;
}): ReactElement {
  const count = family.models.length;
  const summary = count > 1 ? (family.description ?? model.summary) : model.summary;
  return (
    <Link
      to="/models/$modelId"
      params={{ modelId: model.id }}
      search={{}}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-pop focus-visible:outline-2 focus-visible:outline-accent"
    >
      <Thumb model={model} className="aspect-[16/10] p-3" />
      <div className="flex flex-1 flex-col gap-1 p-3.5">
        <h3
          className="text-sm leading-snug font-semibold tracking-tight text-fg group-hover:text-accent"
          title={family.name}
        >
          {count > 1 ? family.name : model.name}
        </h3>
        <p className="line-clamp-2 text-[13px] text-muted">{summary}</p>
        <div className="mt-auto flex items-center gap-3 pt-2 text-2xs text-faint">
          {count > 1 && (
            <span className="tnum">
              {count} {family.path === 'tutorial' ? 'steps' : 'models'}
            </span>
          )}
          <span className="ml-auto">{sourceOf(family)}</span>
        </div>
      </div>
    </Link>
  );
}
