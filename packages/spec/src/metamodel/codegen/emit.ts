// SPDX-License-Identifier: EPL-2.0
//
// The one place where the source text of generated code is put together
// (docs/codegen.md, "Keeping model text out of code"). Models come from other
// people's files, so nothing taken from a model may become code:
//
// - Source text is a `Code`, made only by the `code` tag, whose literal parts
//   are the generator's own source, and by the functions below.
// - An ID from a model becomes part of an identifier only after it is checked
//   here against the ID pattern, and always behind a prefix of a lowercase
//   letter and an underscore (`a_energy`), so that it cannot be a reserved
//   word, `__proto__`, `constructor` or one of the generator's own names,
//   which start with a capital letter or `$`. Parts are joined with `$`,
//   which no ID contains, so two different paths never give one name.
// - A string from a model appears only as a JSON string literal; a number
//   only if it is finite. Anything else the code needs (attributes, agent
//   types, functions, free text) is passed in the constants array `K` and
//   named by a declaration `const t_bug = K[3];`.
// - Nothing from a model goes into a comment.

/** The ID pattern of the model format (schema.ts), checked again here. */
const ID = /^[A-Za-z_][A-Za-z0-9_]*$/;

const brand: unique symbol = Symbol('code');

/** A piece of generated source text. */
export interface Code {
  readonly [brand]: string;
}

function make(text: string): Code {
  return Object.freeze({ [brand]: text });
}

/** The text of a piece of code. */
export function textOf(code: Code): string {
  return code[brand];
}

/** A part of a `code` template: a piece of code, or pieces of code to join. */
type Part = Code | readonly Code[];

/**
 * Generated code from a template whose literal parts are the generator's own
 * source and whose interpolations are code (arrays are joined).
 */
export function code(strings: TemplateStringsArray, ...parts: readonly Part[]): Code {
  let text = strings[0]!;
  parts.forEach((part, i) => {
    if (Array.isArray(part)) text += (part as readonly Code[]).map(textOf).join('');
    else if (typeof part === 'object' && part !== null && brand in part)
      text += textOf(part as Code);
    else throw new TypeError('Only code can be put into generated code');
    text += strings[i + 1]!;
  });
  return make(text);
}

/** Pieces of code joined by a separator. */
export function join(parts: readonly Code[], separator: Code): Code {
  return make(parts.map(textOf).join(textOf(separator)));
}

/**
 * The prefixes of names made from model IDs: a for an attribute, t an agent
 * type, s a space, e an exit, f a function, p a method, r a root act, x the
 * agent bound by an act, m and q remembered values, k other constants.
 */
export type Prefix = 'a' | 't' | 's' | 'e' | 'f' | 'p' | 'r' | 'x' | 'm' | 'q' | 'k';

const PREFIXES: ReadonlySet<string> = new Set([
  'a',
  't',
  's',
  'e',
  'f',
  'p',
  'r',
  'x',
  'm',
  'q',
  'k',
]);

/** Checks one ID of a path. */
function checkedId(id: string): string {
  if (typeof id !== 'string' || !ID.test(id)) {
    throw new UnsafeNameError(`\`${String(id).slice(0, 40)}\` is not an ID`);
  }
  return id;
}

/** An ID, or the IDs of a path (`moves.step`), joined by `$`. */
function pathPart(path: string): string {
  if (path === '') return '';
  return path.split('.').map(checkedId).join('$');
}

/** A model ID or path that cannot be used in a name. */
export class UnsafeNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeNameError';
  }
}

/**
 * A name made from a prefix and the parts of a path from the model: IDs and
 * paths of IDs (each checked), or counts the generator keeps.
 */
export function name(prefix: Prefix, ...parts: readonly (string | number)[]): Code {
  if (!PREFIXES.has(prefix)) throw new UnsafeNameError(`\`${prefix}\` is not a prefix`);
  const text = parts
    .map((part) => {
      if (typeof part === 'number') {
        if (!Number.isSafeInteger(part) || part < 0) throw new UnsafeNameError('Not a count');
        return String(part);
      }
      return pathPart(part);
    })
    .join('$');
  return make(`${prefix}_${text}`);
}

/** The generator's own local names, each with a count. */
export type LocalKind =
  'Found' | 'Ties' | 'Best' | 'Value' | 'C' | 'N' | 'I' | 'O' | 'Sp' | 'From' | 'H';

const LOCAL_KINDS: ReadonlySet<string> = new Set([
  'Found',
  'Ties',
  'Best',
  'Value',
  'C',
  'N',
  'I',
  'O',
  'Sp',
  'From',
  'H',
]);

/** A local name of the generator's own: a kind and a count (`$Found3`). */
export function local(kind: LocalKind, count: number): Code {
  if (!LOCAL_KINDS.has(kind) || !Number.isSafeInteger(count) || count < 0) {
    throw new UnsafeNameError('Not a local name');
  }
  return make(`$${kind}${count}`);
}

/** A finite number as a literal. Infinite and NaN values are constants instead (see {@link Emitter.datum}). */
export function number(value: number): Code {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new UnsafeNameError('Only a finite number can be a literal');
  }
  if (Object.is(value, -0)) return make('(-0)');
  const text = String(value);
  if (!/^-?[0-9.]+(e[+-]?[0-9]+)?$/.test(text)) throw new UnsafeNameError('Not a plain number');
  return make(value < 0 ? `(${text})` : text);
}

/** A string as a JSON string literal, with the line and paragraph separators escaped too. */
export function string(value: string): Code {
  if (typeof value !== 'string') throw new TypeError('Not a string');
  return make(
    JSON.stringify(value)
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029'),
  );
}

/** A boolean as a literal. */
export function boolean(value: boolean): Code {
  return make(value === true ? 'true' : 'false');
}

/** A generated module: its constants and its source, made into a function. */
export class Emitter {
  readonly #constants: unknown[] = [];
  readonly #declarations: Code[] = [];
  readonly #named = new Map<unknown, Code>();
  readonly #names = new Set<string>();

  /**
   * A value the code uses, passed in `K` and declared once under a name made
   * from the prefix and parts (with a count added if the name is taken).
   */
  constant(value: unknown, prefix: Prefix, ...parts: readonly (string | number)[]): Code {
    const known = this.#named.get(value);
    if (known) return known;
    let found = name(prefix, ...parts);
    for (let n = 2; this.#names.has(textOf(found)); n++) found = name(prefix, ...parts, n);
    this.#names.add(textOf(found));
    const index = this.#constants.length;
    this.#constants.push(value);
    this.#declarations.push(code`const ${found} = K[${number(index)}];\n`);
    this.#named.set(value, found);
    return found;
  }

  /** A value from the model: a literal if it is a boolean, finite number or string, else a constant. */
  datum(value: unknown): Code {
    if (typeof value === 'boolean') return boolean(value);
    if (typeof value === 'number' && Number.isFinite(value)) return number(value);
    if (typeof value === 'string') return string(value);
    return this.constant(value, 'k');
  }

  /**
   * Makes the module: `body` is the statements of a function of the
   * constants `K` and the helpers `H`, after the declarations of the
   * constants. `file` names the source in a debugger, from IDs.
   */
  build<T>(body: Code, file: readonly string[], helpers: unknown): T {
    const source = this.source(body, file);
    const factory = new Function('K', 'H', source) as (k: unknown[], h: unknown) => T;
    return factory(this.#constants, helpers);
  }

  /** The source `build` makes a function of. */
  source(body: Code, file: readonly string[]): string {
    const where = file.map(checkedId).join('/');
    return `'use strict';\n${this.#declarations.map(textOf).join('')}${textOf(body)}\n//# sourceURL=metascape/${where}.js\n`;
  }
}
