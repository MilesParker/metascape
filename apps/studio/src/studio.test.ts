// @vitest-environment jsdom
// SPDX-License-Identifier: EPL-2.0
import { RootScape } from '@metascape/engine';
import { life } from '@metascape/models';
import { describe, expect, it } from 'vitest';
import {
  introductory,
  libraryFamilies,
  manifest,
  modelById,
  pathPosition,
  searchModels,
  shortName,
} from './catalog';
import { displayKeys, matchesKeys } from './lib/commands';
import {
  decodeRules,
  encodeRules,
  validateLibrarySearch,
  validateWorkbenchSearch,
} from './lib/url-state';
import { chartCsv, splitViews } from './workbench/ChartDock';
import { bestColumns } from './workbench/Stage';

describe('the address', () => {
  it('keeps rule settings through a round trip, disabled and repeated rules included', () => {
    const chosen = {
      agents: {
        rules: [
          { name: 'Move', occurrence: 0, enabled: true },
          { name: 'Move', occurrence: 1, enabled: false },
        ],
        executionOrder: 'byRule' as const,
        agentsPerIteration: 3,
        executionStyle: 'repeatedDraw' as const,
      },
    };
    const encoded = encodeRules(chosen)!;
    expect(encoded['agents']!.rules).toEqual(['Move', '!Move#1']);
    expect(decodeRules(encoded)).toEqual(chosen);
    expect(encodeRules({})).toBeUndefined();
  });

  it('drops what does not fit instead of failing', () => {
    expect(
      validateWorkbenchSearch({
        seed: 12,
        p: { a: 1, b: { nested: true }, c: 'x', d: Number.NaN },
        r: {
          s: { rules: ['x'], order: 'sideways', style: 'completeTour', n: null },
        },
        c: { changed: {}, added: [{ type: 'pie', series: [] }] },
        view: 'watch',
      }),
    ).toEqual({ seed: 12, p: { a: 1, c: 'x' }, r: undefined, c: undefined, view: undefined });
    expect(validateWorkbenchSearch({ view: 'present' }).view).toBe('present');
    expect(validateLibrarySearch({ q: '  ', topic: 'ecology' })).toEqual({ q: undefined });
  });
});

describe('the catalogue', () => {
  it('finds models by name, topic, author and source, best first', () => {
    expect(searchModels('boids')[0]!.id).toBe('boids');
    expect(searchModels('epstein').length).toBeGreaterThan(5);
    expect(searchModels('epidemics').some((m) => m.tags.includes('epidemics'))).toBe(true);
    expect(searchModels('brookings').length).toBeGreaterThan(5);
    expect(searchModels('zzzz')).toEqual([]);
  });

  it('lists every family once, introductory ones first, and opens the best match', () => {
    const all = libraryFamilies('');
    expect(all).toHaveLength(manifest.families.length);
    expect(new Set(all.map((f) => f.family.id)).size).toBe(all.length);
    expect(all[0]!.model.id).toBe(modelById(introductory[0]!)!.id);
    const trade = libraryFamilies('trade as in the book');
    expect(trade[0]!.model.id).toBe('sugarscape-iv-a-trade-as-in-the-book');
  });

  it('has every introductory model and every path in order', () => {
    for (const id of introductory) expect(modelById(id), id).toBeDefined();
    const bionland = manifest.families.find((f) => f.id === 'ascape-bionland')!;
    expect(bionland.path).toBe('tutorial');
    const second = modelById(bionland.models[1]!)!;
    expect(pathPosition(second)).toMatchObject({ index: 1, count: bionland.models.length });
    expect(pathPosition(second)!.previous!.id).toBe(bionland.models[0]);
    expect(shortName(second)).toBe('Step B');
  });
});

describe('the stage', () => {
  it('tiles views to make the smallest as large as it can be', () => {
    expect(bestColumns([1, 1], 1000, 500)).toBe(2);
    expect(bestColumns([1, 1], 500, 1000)).toBe(1);
    expect(bestColumns([1.5, 1.5], 1000, 600)).toBe(2);
    expect(bestColumns([1, 1, 1, 1], 800, 800)).toBe(2);
  });

  it('puts spatial views on the stage and charts beside it, or charts on the stage when there is no space', () => {
    const root = new RootScape(life, { seed: 1 });
    expect(splitViews(root.allViews)).toEqual({ stage: [0], charts: [1] });
    expect(splitViews(root.allViews.slice(1))).toEqual({ stage: [0], charts: [] });
  });

  it('writes a chart as CSV', () => {
    const root = new RootScape(life, { seed: 1 });
    root.run(2);
    const csv = chartCsv(root, ['live']).trim().split('\n');
    expect(csv[0]).toBe('period,Count live');
    expect(csv).toHaveLength(4);
  });
});

describe('shortcuts', () => {
  it('match keys with and without modifiers', () => {
    const key = (k: string, init: KeyboardEventInit = {}) =>
      new KeyboardEvent('keydown', { key: k, ...init });
    expect(matchesKeys('space', key(' '))).toBe(true);
    expect(matchesKeys('r', key('r'))).toBe(true);
    expect(matchesKeys('r', key('R', { shiftKey: true }))).toBe(false);
    expect(matchesKeys('shift+r', key('R', { shiftKey: true }))).toBe(true);
    expect(matchesKeys('?', key('?', { shiftKey: true }))).toBe(true);
    expect(displayKeys('shift+arrowright')).toBe('⇧→');
  });
});
