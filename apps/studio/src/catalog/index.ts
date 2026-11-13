// SPDX-License-Identifier: EPL-2.0
import data from './manifest.json';
import type { Manifest, ManifestFamily, ManifestModel } from './types';

export * from './types';

/** Every model and family, from the generated manifest. */
export const manifest = data as unknown as Manifest;

const byId = new Map(manifest.models.map((model) => [model.id, model]));
const familyById = new Map(manifest.families.map((family) => [family.id, family]));

export const modelById = (id: string): ManifestModel | undefined => byId.get(id);
export const findFamily = (id: string): ManifestFamily | undefined => familyById.get(id);
export const familyOf = (model: ManifestModel): ManifestFamily => familyById.get(model.familyId)!;

/** A short name for where a family's code came from, for its card. */
export function sourceOf(family: ManifestFamily): string {
  const collection = family.collection;
  if (collection.startsWith('Brookings')) return 'Brookings';
  if (collection.includes('AMP')) return 'Eclipse AMP';
  if (collection.startsWith('Ascape')) return 'Ascape';
  return 'Metascape';
}

/** A model's place in its family's path, when the family is one. */
export function pathPosition(
  model: ManifestModel,
): { index: number; count: number; previous?: ManifestModel; next?: ManifestModel } | undefined {
  const family = familyOf(model);
  if (family.models.length < 2) return undefined;
  const index = family.models.indexOf(model.id);
  const previous = index > 0 ? byId.get(family.models[index - 1]!) : undefined;
  const next = byId.get(family.models[index + 1] ?? '');
  return {
    index,
    count: family.models.length,
    ...(previous && { previous }),
    ...(next && { next }),
  };
}

/** The short name of a model within its family: "Step C" rather than "Bionland: Step C". */
export function shortName(model: ManifestModel): string {
  const family = familyOf(model);
  const prefixes = [family.name, family.name.replace(/\s*\(.*\)$/, '')];
  for (const prefix of prefixes) {
    if (model.name.startsWith(`${prefix}: `)) return model.name.slice(prefix.length + 2);
  }
  const colon = model.name.indexOf(': ');
  return colon > 0 ? model.name.slice(colon + 2) : model.name;
}

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** Models matching a search over names, summaries, topics, authors and source, best first. */
export function searchModels(query: string): ManifestModel[] {
  const terms = words(query);
  const scored: [ManifestModel, number][] = [];
  for (const model of manifest.models) {
    const family = familyOf(model);
    if (terms.length === 0) {
      scored.push([model, 0]);
      continue;
    }
    const name = words(`${model.name} ${family.name}`);
    const rest = words(
      `${model.summary} ${model.description} ${model.tags.join(' ')} ${model.authors ?? ''} ${model.portedFrom ?? ''} ${family.collection}`,
    );
    let score = 0;
    let all = true;
    for (const term of terms) {
      const inName = name.some((w) => w.startsWith(term));
      const inRest = rest.some((w) => w.startsWith(term));
      if (!inName && !inRest) {
        all = false;
        break;
      }
      score += inName ? 3 : 1;
    }
    if (all) scored.push([model, score]);
  }
  return scored.sort((a, b) => b[1] - a[1]).map(([model]) => model);
}

/** Models to start with, in order; their families come first in the Library. */
export const introductory: readonly string[] = [
  'game-of-life',
  'boids',
  'schelling-segregation',
  'epidemic-sir-on-a-small-world-network',
  'wolf-sheep-predation',
  'sugarscape',
];

/**
 * The families to show for a search, each with the model a card opens: the
 * family's first model, or its best match when searching. Without a search,
 * the introductory families come first, then the rest in catalogue order.
 */
export function libraryFamilies(query: string): { family: ManifestFamily; model: ManifestModel }[] {
  if (words(query).length > 0) {
    const seen = new Set<string>();
    const result: { family: ManifestFamily; model: ManifestModel }[] = [];
    for (const model of searchModels(query)) {
      if (seen.has(model.familyId)) continue;
      seen.add(model.familyId);
      result.push({ family: familyOf(model), model });
    }
    return result;
  }
  const first = introductory
    .map((id) => byId.get(id))
    .filter((model): model is ManifestModel => model !== undefined)
    .map((model) => familyOf(model));
  const order = [...new Set([...first, ...manifest.families])];
  return order.map((family) => ({ family, model: byId.get(family.models[0]!)! }));
}
