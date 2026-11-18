// SPDX-License-Identifier: EPL-2.0
//
// Model files that build on others, resolved into one flat model before the
// checker runs. Neither the checker nor the runtime ever sees what is resolved
// here. Two kinds of building on, both decided by the owner (2026-11-18) to be
// resolved at load, so that what a model does can be read from the one flat
// model it becomes:
//
// - An OVERLAY is a model file that names a base model (`extends`) and holds
//   what it adds, replaces or removes, each addressed by a path. Overlays
//   chain: the base may itself be an overlay.
// - An AGENT TYPE may extend another (`"extends": "person"` on an agent). It
//   inherits the parent's attributes, acts and styles, and adds to them or
//   replaces them by ID. A parent marked `"abstract": true` is only there to be
//   inherited from; it is not in the flat model.
//
// A selection of a type does NOT find the type's subtypes: after resolution
// there are no subtypes, only unrelated agent types that began with the same
// definitions. Changing a parent changes what its children are, but a model
// that selects `person` gets only the persons, never the citizens and cops.
// For the science it must be plain when behaviour changes (owner decision).
//
// Overlays are resolved first, on the files as written, and agent types after
// that, on the merged result, so an overlay can replace an act of an agent type
// that others inherit from and its children follow.
import { ModelFormatError, parseModel } from './schema';
import type { Diagnostic, Model } from './types';
import { MODEL_SCHEMA_VERSION } from './types';

/**
 * A model file that builds on another: the shape of an overlay. Not a
 * {@link Model}; it is resolved into one by {@link resolveModel}.
 */
export interface OverlayFile {
  schemaVersion?: typeof MODEL_SCHEMA_VERSION | undefined;
  /** The ID of this model, which replaces its base's. */
  id: string;
  /** The ID of the base model, among the `bases` given to {@link resolveModel}. */
  extends: string;
  /** Replaces the base's label, plural label and description, if given. */
  label?: string | undefined;
  pluralLabel?: string | undefined;
  description?: string | undefined;
  /**
   * Elements to add, by path from the root of the base file
   * (`agents.sugarCell.acts.oneMore`, `agents.sugarAgent.attributes.sex`).
   * The path's parent must exist and the path itself must not. An added
   * element goes last among its siblings.
   */
  add?: Record<string, unknown> | undefined;
  /**
   * Replacements, by the same paths. The path must exist: a replaced element
   * keeps its place among its siblings. Any part of the file can be replaced,
   * down to one act's `targets` or an attribute's `default`; an array is
   * replaced whole.
   */
  replace?: Record<string, unknown> | undefined;
  /** Paths to remove; each must exist. */
  remove?: string[] | undefined;
}

/** Other model files a model may extend, each found by its `id`. */
export interface ResolveOptions {
  readonly bases?: readonly unknown[] | undefined;
}

type Plain = Record<string, unknown>;

/** A copy of JSON, so that what is resolved never changes the file it came from. */
const clone = <T>(value: T): T =>
  value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);

const isPlain = (value: unknown): value is Plain =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const ID_PART = '[A-Za-z_][A-Za-z0-9_]*';
const PATH = new RegExp(`^${ID_PART}(\\.${ID_PART})*$`);

/** What an overlay may hold, and what it may not change by path (it has them as its own fields). */
const ENVELOPE = new Set([
  'schemaVersion',
  'id',
  'extends',
  'label',
  'pluralLabel',
  'description',
  'add',
  'replace',
  'remove',
]);
const FIXED = new Set(['schemaVersion', 'id', 'extends']);

/** Whether a model file builds on another, so that it must be resolved before it is a {@link Model}. */
export function isOverlay(source: unknown): boolean {
  return isPlain(source) && 'extends' in source;
}

/**
 * Resolves a model file into one flat, checked-for-shape {@link Model}:
 * overlays applied along their chain of bases, then agent types that extend
 * others made flat. A model with neither is only parsed.
 *
 * The files of the bases are given in `options.bases` and found by `id`.
 * Errors in an overlay (an `extends` with no such base, a cycle, a path that is
 * not there or already is) are thrown as a {@link ModelFormatError} whose
 * diagnostics name the overlay's file by its model ID (`file`) and the path.
 */
export function resolveModel(source: unknown, options: ResolveOptions = {}): Model {
  const bases = indexBases(options.bases ?? []);
  return parseModel(resolveTypes(clone(applyOverlays(source, bases, []))));
}

// ───────────────────────────── Overlays ─────────────────────────────

function fail(file: string, problems: readonly Omit<Diagnostic, 'severity' | 'file'>[]): never {
  throw new ModelFormatError(
    problems.map((problem) => ({ ...problem, severity: 'error' as const, file })),
  );
}

function indexBases(bases: readonly unknown[]): Map<string, unknown> {
  const found = new Map<string, unknown>();
  for (const base of bases) {
    if (!isPlain(base) || typeof base['id'] !== 'string') {
      fail('(bases)', [{ path: '', message: 'Every base model file is an object with an `id`' }]);
    }
    const id = base['id'];
    if (found.has(id)) {
      fail(id, [{ path: 'id', message: `Two base model files have the ID \`${id}\`` }]);
    }
    found.set(id, base);
  }
  return found;
}

/** The file as a plain model object with no root `extends`: overlays applied, the source never changed. */
function applyOverlays(source: unknown, bases: Map<string, unknown>, chain: string[]): Plain {
  if (!isPlain(source)) {
    fail('(model)', [{ path: '', message: 'A model file is an object' }]);
  }
  const file = typeof source['id'] === 'string' ? source['id'] : '(model)';
  if (!('extends' in source)) return source;

  const problems: Omit<Diagnostic, 'severity' | 'file'>[] = [];
  const problem = (path: string, message: string) => problems.push({ path, message });

  for (const key of Object.keys(source)) {
    if (!ENVELOPE.has(key)) {
      problem(
        key,
        `An overlay holds its own \`id\`, \`label\`, \`pluralLabel\` and \`description\`, the base it \`extends\`, and \`add\`, \`replace\` and \`remove\`; put \`${key}\` under \`add\` or \`replace\`, by its path`,
      );
    }
  }
  const base = source['extends'];
  if (typeof base !== 'string') problem('extends', 'The base is named by its model ID, a string');
  if (typeof source['id'] !== 'string') problem('id', 'An overlay has its own model `id`');
  if (source['schemaVersion'] !== undefined && source['schemaVersion'] !== MODEL_SCHEMA_VERSION) {
    problem('schemaVersion', `The schema version is ${MODEL_SCHEMA_VERSION}`);
  }
  for (const key of ['label', 'pluralLabel', 'description']) {
    if (source[key] !== undefined && typeof source[key] !== 'string') problem(key, 'This is text');
  }
  for (const section of ['add', 'replace'] as const) {
    if (source[section] !== undefined && !isPlain(source[section])) {
      problem(section, `\`${section}\` maps the paths to ${section} to their elements`);
    }
  }
  const removals = source['remove'];
  if (removals !== undefined && !(Array.isArray(removals) && removals.every(isString))) {
    problem('remove', '`remove` lists paths');
  }
  if (typeof base === 'string') {
    if ([...chain, file].includes(base)) {
      problem(
        'extends',
        `Models extend each other in a cycle: ${[...chain, file, base].join(' → ')}`,
      );
    } else if (!bases.has(base)) {
      const known = [...bases.keys()].map((id) => `\`${id}\``);
      problem(
        'extends',
        `There is no model \`${base}\` to extend${known.length > 0 ? `; the models given are ${known.join(', ')}` : ' (no base models were given)'}`,
      );
    }
  }
  if (problems.length > 0) fail(file, problems);

  const resolved = clone(applyOverlays(bases.get(base as string), bases, [...chain, file]));
  resolved['id'] = source['id'];
  for (const key of ['label', 'pluralLabel', 'description']) {
    if (typeof source[key] === 'string') resolved[key] = source[key];
  }

  // Removed first, then replaced, then added, each in the order written: a path can be removed
  // and added again, and a path added is not one that was already there.
  ((removals as string[] | undefined) ?? []).forEach((path, index) => {
    const at = `remove[${index}]`;
    const place = locate(resolved, path, at, problem);
    if (!place) return;
    if (place.exists) delete place.parent[place.key];
    else problem(at, `There is nothing at \`${path}\` to remove`);
  });
  for (const section of ['replace', 'add'] as const) {
    for (const [path, value] of Object.entries((source[section] as Plain | undefined) ?? {})) {
      const at = `${section}["${path}"]`;
      const place = locate(resolved, path, at, problem);
      if (!place) continue;
      if (value === null || value === undefined) {
        problem(at, `A value is needed; to take \`${path}\` away, use \`remove\``);
      } else if (section === 'replace' && !place.exists) {
        problem(
          at,
          `There is nothing at \`${path}\` to replace; to put something there, use \`add\``,
        );
      } else if (section === 'add' && place.exists) {
        problem(at, `There is already something at \`${path}\`; to change it, use \`replace\``);
      } else place.parent[place.key] = clone(value);
    }
  }
  if (problems.length > 0) fail(file, problems);
  return resolved;
}

const isString = (value: unknown): value is string => typeof value === 'string';

/**
 * The object that holds the path's last key, the key, and whether it is there.
 * Reports, and returns nothing, for a path that is malformed, that names one
 * of the overlay's own fields, or whose parent is not there.
 */
function locate(
  root: Plain,
  path: string,
  at: string,
  problem: (path: string, message: string) => void,
): { parent: Plain; key: string; exists: boolean } | undefined {
  if (!PATH.test(path)) {
    problem(
      at,
      `\`${path}\` is not a path: IDs separated by dots, such as agents.sugarCell.acts.growBack`,
    );
    return undefined;
  }
  const parts = path.split('.');
  const key = parts.pop()!;
  if (parts.length === 0 && FIXED.has(key)) {
    problem(at, `\`${path}\` is one of the overlay's own fields, not an element of the base`);
    return undefined;
  }
  let parent: unknown = root;
  for (const part of parts) parent = isPlain(parent) ? parent[part] : undefined;
  if (!isPlain(parent)) {
    problem(at, `There is nothing at \`${parts.join('.')}\` to hold \`${key}\``);
    return undefined;
  }
  return { parent, key, exists: Object.hasOwn(parent, key) };
}

// ───────────────────────────── Agent types ─────────────────────────────

interface TypeNode {
  readonly path: string;
  /** Where the agent is in the file, as a diagnostic path. */
  readonly at: string;
  readonly holder: Plain;
  readonly id: string;
  agent: Plain;
}

/** What an inherited act or style names by an attribute, and what by an option. */
const ATTRIBUTE_FIELDS = new Set(['attribute', 'diffused', 'diffusionRate', 'evaporationRate']);
const ATTRIBUTE_LISTS = new Set(['multiValue', 'attributes']);

function rewriteReferences(value: unknown, from: string, to: string): unknown {
  const rewrite = (text: unknown) =>
    typeof text === 'string' && text.startsWith(`${from}.`)
      ? `${to}${text.slice(from.length)}`
      : text;
  if (Array.isArray(value)) return value.map((item) => rewriteReferences(item, from, to));
  if (!isPlain(value)) return value;
  const result: Plain = {};
  for (const [key, member] of Object.entries(value)) {
    if (ATTRIBUTE_FIELDS.has(key) || key === 'option') result[key] = rewrite(member);
    else if (ATTRIBUTE_LISTS.has(key) && Array.isArray(member)) result[key] = member.map(rewrite);
    else result[key] = rewriteReferences(member, from, to);
  }
  return result;
}

function resolveTypes(model: Plain): Plain {
  const file = typeof model['id'] === 'string' ? model['id'] : '(model)';
  const nodes = new Map<string, TypeNode>();
  const collect = (scape: Plain, prefix: string, at: string) => {
    const agents = scape['agents'];
    if (!isPlain(agents)) return;
    for (const [id, agent] of Object.entries(agents)) {
      if (!isPlain(agent)) continue;
      const path = prefix === '' ? id : `${prefix}.${id}`;
      const here = `${at}agents.${id}`;
      nodes.set(path, { path, at: here, holder: agents, id, agent });
      if (agent['kind'] === 'scape') collect(agent, path, `${here}.`);
    }
  };
  collect(model, '', '');
  const wanted = [...nodes.values()].filter(
    (node) => 'extends' in node.agent || 'abstract' in node.agent,
  );
  if (wanted.length === 0) return model;

  const problems: Omit<Diagnostic, 'severity' | 'file'>[] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  /** Makes the node's type flat, its parent first. */
  const resolveNode = (node: TypeNode, trail: readonly string[]): void => {
    if (state.get(node.path) === 'done') return;
    state.set(node.path, 'visiting');
    flatten(node, trail);
    state.set(node.path, 'done');
  };

  const flatten = (node: TypeNode, trail: readonly string[]): void => {
    const own = node.agent;
    const problem = (field: string, message: string) =>
      problems.push({ path: `${node.at}.${field}`, message });
    if ('abstract' in own && typeof own['abstract'] !== 'boolean') {
      problem('abstract', '`abstract` is true or false');
    }
    if (!('extends' in own)) return;
    const parentPath = own['extends'];
    if (typeof parentPath !== 'string') {
      problem('extends', 'A type extends its parent type by its path, such as `person`');
      return;
    }
    if (own['kind'] !== 'agent') {
      problem('extends', 'Only an agent type extends another; a scape does not');
      return;
    }
    const parent = nodes.get(parentPath);
    if (!parent) {
      problem('extends', `There is no agent type \`${parentPath}\` to extend`);
      return;
    }
    if (parent.agent['kind'] !== 'agent') {
      problem('extends', `\`${parentPath}\` is a scape; only an agent type can be extended`);
      return;
    }
    if (state.get(parentPath) === 'visiting') {
      problem(
        'extends',
        `Agent types extend each other in a cycle: ${[...trail, node.path, parentPath].join(' → ')}`,
      );
      return;
    }
    resolveNode(parent, [...trail, node.path]);

    // The parent is flat by now. Its acts and styles are written for it, so what
    // they name of its own attributes and options becomes the child's.
    const inherited = parent.agent;
    const flat: Plain = { ...own };
    delete flat['extends'];
    for (const section of ['attributes', 'acts', 'styles'] as const) {
      const fromParent = inherited[section];
      const fromChild = own[section];
      if (fromParent === undefined && fromChild === undefined) continue;
      const taken: unknown =
        section === 'attributes'
          ? clone(fromParent)
          : rewriteReferences(fromParent, parentPath, node.path);
      flat[section] = {
        ...(isPlain(taken) ? taken : {}),
        ...(isPlain(fromChild) ? fromChild : {}),
      };
    }
    if (inherited['execution'] !== undefined || own['execution'] !== undefined) {
      flat['execution'] = {
        ...(isPlain(inherited['execution']) ? clone(inherited['execution']) : {}),
        ...(isPlain(own['execution']) ? own['execution'] : {}),
      };
    }
    node.holder[node.id] = flat;
    node.agent = flat;
  };

  for (const node of wanted) resolveNode(node, []);
  if (problems.length > 0) fail(file, problems);

  for (const node of wanted) {
    if (node.agent['abstract'] === true) delete node.holder[node.id];
    else delete node.agent['abstract'];
  }
  return model;
}
