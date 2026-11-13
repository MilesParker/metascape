// SPDX-License-Identifier: EPL-2.0
import type {
  Sampling,
  ScapeSettings,
  Schedule,
  SimulationSettings,
  VisitOrder,
} from '@metascape/engine';
import type { ChartCustomizations } from '@metascape/react';

/*
 * Everything that reproduces a run lives in the address: model (the path),
 * seed, parameters, rule settings, chart choices and whether it is being
 * presented. Runs are deterministic, so the same address shows the same run.
 */

/** One scape's rule settings in the address: rule keys in order, `!` marking those switched off. */
export interface CompactScape {
  readonly rules: readonly string[];
  readonly schedule: Schedule;
  readonly order: VisitOrder;
  readonly sampling: Sampling;
  readonly n: number | null;
}

export interface WorkbenchSearch {
  readonly seed?: number | string | undefined;
  /** Parameter values that differ from the defaults. */
  readonly p?: Readonly<Record<string, number | string | boolean>> | undefined;
  /** Rule settings of the scapes the user changed. */
  readonly r?: Readonly<Record<string, CompactScape>> | undefined;
  readonly c?: ChartCustomizations | undefined;
  /** Set while presenting: the chrome hidden. */
  readonly view?: 'present' | undefined;
}

export interface LibrarySearch {
  readonly q?: string | undefined;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const SCHEDULES: readonly Schedule[] = ['byAgent', 'byRule'];
const ORDERS: readonly VisitOrder[] = ['shuffled', 'sequential'];
const SAMPLINGS: readonly Sampling[] = ['tour', 'draw'];

/** The rule settings a user chose, in address form. */
export function encodeRules(chosen: SimulationSettings): Record<string, CompactScape> | undefined {
  const entries = Object.entries(chosen);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(
    entries.map(([scape, settings]) => [
      scape,
      {
        rules: settings.rules.map(
          (rule) =>
            `${rule.enabled ? '' : '!'}${rule.occurrence === 0 ? rule.name : `${rule.name}#${rule.occurrence}`}`,
        ),
        schedule: settings.schedule,
        order: settings.order,
        sampling: settings.sampling,
        n: settings.activations,
      },
    ]),
  );
}

/** Rule settings from the address; malformed entries are dropped. */
export function decodeRules(r: WorkbenchSearch['r']): SimulationSettings {
  const result: Record<string, ScapeSettings> = {};
  for (const [scape, compact] of Object.entries(r ?? {})) {
    if (!isRecord(compact) || !Array.isArray(compact['rules'])) continue;
    const c = compact as unknown as CompactScape;
    if (!SCHEDULES.includes(c.schedule) || !ORDERS.includes(c.order)) continue;
    if (!SAMPLINGS.includes(c.sampling)) continue;
    if (c.n !== null && !(Number.isInteger(c.n) && c.n >= 1)) continue;
    result[scape] = {
      rules: c.rules
        .filter((key): key is string => typeof key === 'string' && key.length > 0)
        .map((key) => {
          const enabled = !key.startsWith('!');
          const bare = enabled ? key : key.slice(1);
          const hash = /^(.*)#(\d+)$/.exec(bare);
          return hash
            ? { name: hash[1]!, occurrence: Number(hash[2]), enabled }
            : { name: bare, occurrence: 0, enabled };
        }),
      schedule: c.schedule,
      order: c.order,
      sampling: c.sampling,
      activations: c.n,
    };
  }
  return result;
}

function validCharts(value: unknown): ChartCustomizations | undefined {
  if (!isRecord(value) || !isRecord(value['changed']) || !Array.isArray(value['added'])) {
    return undefined;
  }
  const choice = (v: unknown): boolean =>
    isRecord(v) &&
    (v['type'] === 'timeSeries' || v['type'] === 'bars') &&
    Array.isArray(v['series']) &&
    v['series'].every((s) => typeof s === 'string');
  if (!Object.values(value['changed']).every(choice)) return undefined;
  if (
    !value['added'].every((a) => choice(a) && typeof (a as { title?: unknown }).title === 'string')
  ) {
    return undefined;
  }
  return value as unknown as ChartCustomizations;
}

/** Checks and tidies the Workbench's address parameters; anything malformed is dropped. */
export function validateWorkbenchSearch(search: Record<string, unknown>): WorkbenchSearch {
  const seed = search['seed'];
  const p = search['p'];
  const view = search['view'];
  const params = isRecord(p)
    ? Object.fromEntries(
        Object.entries(p).filter(
          ([, v]) =>
            (typeof v === 'number' && Number.isFinite(v)) ||
            typeof v === 'string' ||
            typeof v === 'boolean',
        ),
      )
    : undefined;
  const rules = isRecord(search['r']) ? decodeRules(search['r'] as WorkbenchSearch['r']) : {};
  return {
    seed:
      typeof seed === 'number' && Number.isFinite(seed)
        ? seed
        : typeof seed === 'string' && seed !== ''
          ? seed
          : undefined,
    p: params && Object.keys(params).length > 0 ? (params as WorkbenchSearch['p']) : undefined,
    r: encodeRules(rules),
    c: validCharts(search['c']),
    view: view === 'present' ? 'present' : undefined,
  };
}

export function validateLibrarySearch(search: Record<string, unknown>): LibrarySearch {
  const text = (key: string): string | undefined => {
    const value = search[key];
    return typeof value === 'string' && value.trim() !== '' ? value : undefined;
  };
  return { q: text('q') };
}

/** Drops undefined fields, so addresses stay short. */
export function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
