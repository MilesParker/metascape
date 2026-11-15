// SPDX-License-Identifier: EPL-2.0
import { RootScape, type Model } from '@metascape/engine';
import { catalog } from '@metascape/models';
import { latticeOf } from '@metascape/react';
import { compileModel, exampleSpecs } from '@metascape/spec';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { DATA_FAMILY } from './data-family';
import { slug } from './slug';
import { renderThumbnail, type Picture } from './thumbnail';
import type { Manifest, ManifestFamily, ManifestModel, SpaceKind } from './types';

/*
 * The catalogue manifest lets the Library list every model without loading
 * model code. This test rebuilds it from the models and fails when the
 * checked-in copy is out of date. Run `UPDATE_CATALOG=1 npx vitest run
 * apps/studio/src/catalog` to rewrite it and the card pictures.
 */

const here = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(here, 'manifest.json');
const THUMBS = join(here, '../../public/thumbs');
const THUMB_TICKS = 60;
const SEED = 1;

/** The first sentence of a description, at most about 160 characters. */
export function firstSentence(text: string): string {
  const match = /^(.{20,}?[.!?])(\s+[A-Z(]|$)/s.exec(text.trim());
  const sentence = (match ? match[1]! : text.trim()).replace(/\s+/g, ' ');
  return sentence.length <= 170 ? sentence : `${sentence.slice(0, 160).replace(/\s+\S*$/, '')}…`;
}

function spacesOf(root: RootScape): SpaceKind[] {
  const kinds = new Set<SpaceKind>();
  for (const view of root.allViews) {
    if (view.type === 'grid') kinds.add(latticeOf(view).height === 1 ? 'strip' : 'lattice');
    else if (view.type === 'continuous') kinds.add('plane');
    else if (view.type === 'network') kinds.add('network');
  }
  if (kinds.size === 0) kinds.add('charts');
  return [...kinds];
}

function png(picture: Picture): Buffer {
  const { width, height, rgba } = picture;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(
      raw,
      y * (width * 4 + 1) + 1,
    );
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

interface Built {
  readonly manifest: Manifest;
  readonly pictures: ReadonlyMap<string, Picture>;
}

function describeModel(
  id: string,
  model: Model,
  familyId: string,
  familyTags: readonly string[],
  withPictures: boolean,
  pictures: Map<string, Picture>,
): ManifestModel {
  const root = new RootScape(model, { seed: SEED });
  const ruleCount = root.scapes.reduce((n, scape) => n + scape.rules.length, 0);
  let thumb: ManifestModel['thumb'] = {
    file: `thumbs/${id}.png`,
    width: 1,
    height: 1,
    pixelated: false,
  };
  const picture = renderThumbnail(root, THUMB_TICKS);
  if (picture) {
    thumb = {
      ...thumb,
      width: picture.width,
      height: picture.height,
      pixelated: picture.pixelated,
    };
    if (withPictures) pictures.set(id, picture);
  }
  const provenance = model.provenance;
  return {
    id,
    name: model.name,
    familyId,
    summary: model.summary ?? firstSentence(model.description ?? model.name),
    description: model.description ?? '',
    tags: [...new Set([...familyTags, ...(model.tags ?? [])])],
    spaces: spacesOf(root),
    parameterCount: Object.keys(model.parameters).length,
    ruleCount,
    ...(provenance?.authors && { authors: provenance.authors }),
    ...(provenance?.portedFrom && { portedFrom: provenance.portedFrom }),
    thumb,
  };
}

function build(withPictures: boolean): Built {
  const pictures = new Map<string, Picture>();
  const families: ManifestFamily[] = [];
  const models: ManifestModel[] = [];
  for (const family of catalog) {
    const ids = family.models.map((model) => slug(model.name));
    families.push({
      id: family.id,
      name: family.name,
      collection: family.collection,
      ...(family.description && { description: family.description }),
      tags: family.tags ?? [],
      ...(family.path && { path: family.path }),
      models: ids,
    });
    family.models.forEach((model, i) =>
      models.push(
        describeModel(ids[i]!, model, family.id, family.tags ?? [], withPictures, pictures),
      ),
    );
  }
  const dataIds: string[] = [];
  for (const [key, spec] of Object.entries(exampleSpecs)) {
    const id = `data-${slug(key)}`;
    dataIds.push(id);
    models.push(
      describeModel(
        id,
        compileModel(spec),
        DATA_FAMILY.id,
        DATA_FAMILY.tags,
        withPictures,
        pictures,
      ),
    );
  }
  families.push({ ...DATA_FAMILY, tags: [...DATA_FAMILY.tags], models: dataIds });
  return { manifest: { families, models }, pictures };
}

describe('catalogue manifest', () => {
  const update = process.env['UPDATE_CATALOG'] === '1';
  const { manifest, pictures } = build(update);

  if (update) {
    it('is rewritten with its pictures', () => {
      mkdirSync(THUMBS, { recursive: true });
      for (const [id, picture] of pictures) writeFileSync(join(THUMBS, `${id}.png`), png(picture));
      writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
    });
    return;
  }

  it('is up to date with the models (UPDATE_CATALOG=1 rewrites it)', () => {
    const stored = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
    expect(stored).toEqual(manifest);
  });

  it('has a picture for every model and unique ids', () => {
    const ids = manifest.models.map((model) => model.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const model of manifest.models) {
      expect(existsSync(join(THUMBS, `${model.id}.png`)), model.id).toBe(true);
    }
  });

  it('names where every ported model comes from', () => {
    for (const family of manifest.families) {
      if (family.collection === 'Metascape examples') continue;
      for (const id of family.models) {
        expect(manifest.models.find((m) => m.id === id)?.portedFrom, id).toBeTruthy();
      }
    }
  });

  it('cuts summaries at the first sentence', () => {
    expect(firstSentence('A model of many small things. It does more. And more.')).toBe(
      'A model of many small things.',
    );
    expect(firstSentence('Short.')).toBe('Short.');
  });
});
